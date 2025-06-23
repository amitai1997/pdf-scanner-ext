/**
 * ESLint configuration for the PDF Scanner project.
 */
import js from '@eslint/js';
import security from 'eslint-plugin-security';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    plugins: {
      security
    },
    rules: {
      ...security.configs.recommended.rules,
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': 'error',
      'curly': 'error'
    },
    languageOptions: {
      globals: {
        chrome: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        FileReader: 'readonly',
        Promise: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        // Browser APIs
        atob: 'readonly',
        btoa: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        Event: 'readonly',
        MutationObserver: 'readonly',
        Node: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        // Service Worker globals
        self: 'readonly',
        importScripts: 'readonly',
        // Extension globals (defined by script loading order)
        logger: 'readonly',
        extensionLogger: 'readonly',
        PDF_CONSTANTS: 'readonly',
        isPdfCandidate: 'readonly',
        checkIfBodyContainsPDF: 'readonly',
        isBase64PDF: 'readonly',
        isFileTooLarge: 'readonly',
        extractPDFFromBody: 'readonly',
        extractPDFFromRequest: 'readonly',
        isPDFPart: 'readonly',
        extractFilename: 'readonly',
        FormDataParser: 'readonly',
        PDFMonitor: 'readonly',
        PDFMonitorUI: 'readonly',
        PDFInterceptor: 'readonly',
        loadSharedCSS: 'readonly',
        showStandaloneError: 'readonly',
        removeExistingIndicators: 'readonly',
        removeExistingSecurityWarnings: 'readonly',
  
        // Node.js/CommonJS
        module: 'readonly',
        require: 'readonly'
      },
      ecmaVersion: 2022,
      sourceType: 'module'
    }
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        global: 'readonly',
        File: 'readonly'
      }
    }
  },
  {
    // Turn off console warnings in the logger utility
    files: ['src/utils/logger.js'],
    rules: {
      'no-console': 'off'
    }
  }
];
