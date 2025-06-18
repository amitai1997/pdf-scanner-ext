#!/usr/bin/env node

const fs = require('fs');

// Simple function to create a PDF with text content
function createTestPDF(filename, content) {
  // Use a much simpler approach - just embed the text directly in the PDF
  // This creates a minimal PDF that pdf-parse can definitely handle
  const pdfContent = `%PDF-1.3
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj  
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${content.length + 20} >>
stream
BT 50 750 Td (${content.replace(/\n/g, ' ')}) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
0000000111 00000 n
0000000212 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
${280 + content.length}
%%EOF`;

  fs.writeFileSync(filename, pdfContent);
  console.log(`Created test PDF: ${filename}`);
}

// Create test PDFs with different types of secrets
console.log('Creating test PDFs with secrets...');

// PDF with AWS keys
createTestPDF('test_aws_secrets.pdf', `
Confidential Document

AWS Access Key: AKIAIOSFODNN7EXAMPLE
AWS Secret Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

Database Password: super_secret_password_123
API Key: sk-1234567890abcdef1234567890abcdef
`);

// PDF with other secrets
createTestPDF('test_other_secrets.pdf', `
Configuration File

api_key=abc123def456ghi789
bearer_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
authorization: Bearer secret_token_here

-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdef...
-----END RSA PRIVATE KEY-----
`);

// PDF with no secrets (clean)
createTestPDF('test_clean.pdf', `
Clean Document

This PDF contains no sensitive information.
Just regular text content for testing.
No secrets, keys, or tokens here.
`);

console.log('Test PDFs created successfully!');
console.log('Files:');
console.log('- test_aws_secrets.pdf (contains AWS keys)');
console.log('- test_other_secrets.pdf (contains API keys and private key)');
console.log('- test_clean.pdf (clean file)'); 