import { logger } from './logger.js';
import { PDF_CONSTANTS } from './constants.js';

export function monitorXHRAndFetch() {
  try {
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      this._pdfScannerMethod = method;
      this._pdfScannerUrl = url;
      return originalXHROpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function (body) {
      if (this._pdfScannerMethod === 'POST' && body) {
        try {
          const isPDF = checkIfBodyContainsPDF(body);
          if (isPDF) {
            logger.log('Detected PDF in XHR request to:', this._pdfScannerUrl);
            extractPDFFromBody(body)
              .then((pdfData) => {
                if (pdfData) {
                  chrome.runtime.sendMessage({
                    type: 'intercepted_pdf',
                    requestId: `xhr-${Date.now()}`,
                    filename: pdfData.filename || 'document.pdf',
                    fileSize: pdfData.size,
                    fileData: pdfData.data,
                  });
                }
              })
              .catch((err) => logger.error('Error extracting PDF from XHR:', err));
          }
        } catch (e) {
          logger.error('Error in XHR send override:', e);
        }
      }
      return originalXHRSend.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = function (resource, init) {
      if (init && init.method === 'POST' && init.body) {
        try {
          const isPDF = checkIfBodyContainsPDF(init.body);
          if (isPDF) {
            logger.log('Detected PDF in fetch request to:', resource);
            extractPDFFromBody(init.body)
              .then((pdfData) => {
                if (pdfData) {
                  chrome.runtime.sendMessage({
                    type: 'intercepted_pdf',
                    requestId: `fetch-${Date.now()}`,
                    filename: pdfData.filename || 'document.pdf',
                    fileSize: pdfData.size,
                    fileData: pdfData.data,
                  });
                }
              })
              .catch((err) => logger.error('Error extracting PDF from fetch:', err));
          }
        } catch (e) {
          logger.error('Error in fetch override:', e);
        }
      }
      return originalFetch.apply(this, arguments);
    };

    logger.log('XHR and fetch monitoring set up');
  } catch (error) {
    logger.error('Error setting up XHR/fetch monitoring:', error);
  }
}

export function checkIfBodyContainsPDF(body) {
  try {
    return _checkIfBodyContainsPDFShared(body);
  } catch (e) {
    logger.error('Error checking if body contains PDF:', e);
    return false;
  }
}

export function _checkIfBodyContainsPDFShared(body) {
  if (!body) return false;
  if (typeof body === 'string') {
    return (
      body.includes('application/pdf') ||
      body.includes('.pdf') ||
      body.includes('%PDF-') ||
      body.includes('data:application/pdf')
    );
  }
  if (body instanceof FormData) {
    let hasPDF = false;
    body.forEach((value) => {
      if (_isPdfCandidate(value)) {
        hasPDF = true;
      }
    });
    return hasPDF;
  }
  if (body instanceof Blob || body instanceof File) {
    return _isPdfCandidate(body);
  }
  return false;
}

export function _isPdfCandidate(file) {
  if (!file) return false;
  if (file.type && PDF_CONSTANTS.PDF_MIME_TYPES.includes(file.type)) {
    return true;
  }
  if (file.name && file.name.toLowerCase().endsWith('.pdf')) {
    return true;
  }
  if (typeof file === 'object' && !file.type && !file.name) {
    const filename = file.filename || file.originalname;
    if (filename && filename.toLowerCase().endsWith('.pdf')) {
      return true;
    }
  }
  return false;
}

export async function extractPDFFromBody(body) {
  try {
    if (!body) return null;
    if (body instanceof FormData) {
      let pdfFile = null;
      body.forEach((value) => {
        if (
          value instanceof File &&
          (value.type === 'application/pdf' || value.name.endsWith('.pdf'))
        ) {
          pdfFile = value;
        }
      });
      if (pdfFile) {
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
          reader.onload = () => {
            resolve({ filename: pdfFile.name, size: pdfFile.size, data: reader.result });
          };
          reader.onerror = reject;
          reader.readAsDataURL(pdfFile);
        });
      }
    }
    if (
      (body instanceof Blob && body.type === 'application/pdf') ||
      (body instanceof File && (body.type === 'application/pdf' || body.name.endsWith('.pdf')))
    ) {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = () => {
          resolve({
            filename: body instanceof File ? body.name : 'document.pdf',
            size: body.size,
            data: reader.result,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(body);
      });
    }
    if (typeof body === 'string' && body.includes('data:application/pdf;base64,')) {
      const match = body.match(/data:application\/pdf;base64,([^"'\s]+)/);
      if (match && match[1]) {
        const base64Data = match[1];
        const size = Math.floor(base64Data.length * 0.75);
        return {
          filename: 'document.pdf',
          size,
          data: `data:application/pdf;base64,${base64Data}`,
        };
      }
    }
    return null;
  } catch (e) {
    logger.error('Error extracting PDF from body:', e);
    return null;
  }
}
