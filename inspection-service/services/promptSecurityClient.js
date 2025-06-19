/** Resilient client for Prompt Security protect API (retry, timeout, response mapping). */

const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

class PromptSecurityClient {
  constructor() {
    // Load API information from environment variables
    this.apiUrl = 'https://eu.prompt.security/api/protect';
    // this.appId = process.env.PROMPT_SECURITY_APP_ID;
    this.appId = 'cc6a6cfc-9570-4e5a-b6ea-92d2adac90e4'; // For testing purposes, replace with actual env variable in production

    // Retry configuration
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
    this.timeout = 30000; // 30 seconds
    
    if (!this.appId) {
      logger.warn('PROMPT_SECURITY_APP_ID not set in environment variables');
    }
  }

  /**
   * Send text to Prompt Security API for analysis
   * @param {string} text - The text extracted from PDF to analyze
   * @returns {Promise<object>} - API response with findings
   */
  async scanText(text) {
    if (!text || typeof text !== 'string') {
      throw new AppError('Invalid text provided for scanning', 400);
    }

    // Truncate text if too long (API might have limits)
    const maxTextLength = 100000; // 100KB
    const truncatedText = text.length > maxTextLength 
      ? text.substring(0, maxTextLength) + '... [truncated]' 
      : text;

    logger.debug(`Sending ${truncatedText.length} characters to Prompt Security API`);

    let attempt = 0;
    let lastError = null;

    // Retry logic
    while (attempt < this.maxRetries) {
      try {
        attempt++;
        logger.debug(`API attempt ${attempt} of ${this.maxRetries}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'APP-ID': this.appId,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ prompt: truncatedText }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Handle non-200 responses
        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`API returned status ${response.status}: ${errorText}`);
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        // Parse and format response
        const data = await response.json();
        logger.debug('Raw API response:', JSON.stringify(data));
        
        // Map API response to our expected format
        return this.mapApiResponse(data);
      } catch (error) {
        lastError = error;
        logger.error(`API attempt ${attempt} failed:`, error.message);

        // Don't retry if it's a client error
        if (error.message.includes('400') || error.message.includes('401') || 
            error.message.includes('403')) {
          break;
        }

        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          logger.debug(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If we get here, all attempts failed - throw error instead of defaulting to allow
    // This prevents false negatives where files with secrets are incorrectly marked as clean
    logger.error('Prompt Security API completely unavailable after all retries');
    throw new AppError(`Security scanning service unavailable: ${lastError?.message}`, 503);
  }

  /**
   * Map API response to our expected format
   * @param {object} apiResponse - Raw API response
   * @returns {object} - Formatted scan result
   */
  mapApiResponse(apiResponse) {
    try {
      // Check if the response has the expected structure
      if (!apiResponse || !apiResponse.result) {
        throw new Error('Invalid API response format');
      }

      const { result } = apiResponse;
      const action = result.action || 'allow';
      
      // Extract findings from the prompt, safely checking for array
      const findings = [];
      
      // Handle findings from the API (expect an object with different categories)
      if (result.prompt && result.prompt.findings) {
        const findingsObj = result.prompt.findings;
        
        // Secrets category
        if (findingsObj.Secrets && Array.isArray(findingsObj.Secrets)) {
          findingsObj.Secrets.forEach(secret => {
            findings.push({
              type: 'Secret',
              category: secret.category || 'Unknown',
              value: secret.entity || 'Unknown',
              entity_type: secret.entity_type || 'Unknown',
              severity: 'high'
            });
          });
        }
        
        // URLs category
        if (findingsObj['URLs Detector'] && Array.isArray(findingsObj['URLs Detector'])) {
          findingsObj['URLs Detector'].forEach(url => {
            findings.push({
              type: 'URL',
              value: url.entities || 'Unknown URL',
              blocked: url.blocked || false,
              severity: 'low'
            });
          });
        }
        
        // Check other categories
        Object.keys(findingsObj).forEach(category => {
          if (category !== 'Secrets' && category !== 'URLs Detector') {
            if (Array.isArray(findingsObj[category])) {
              // Add a single summarized finding for other categories
              const count = findingsObj[category].length;
              if (count > 0) {
                findings.push({
                  type: category,
                  value: `${count} detection(s)`,
                  severity: 'info'
                });
              }
            }
          }
        });
      }

      // Check for violations in result - ONLY treat actual secrets as dangerous
      let hasSecrets = findings.some(f => f.type === 'Secret');
      
      // Violations are in result.prompt.violations, not result.violations
      const violations = result.prompt?.violations || result.violations || [];
      
      logger.debug(`Checking violations - hasSecrets: ${hasSecrets}, action: ${action}`);
      logger.debug(`Violations found:`, violations);
      
      // Check for explicit secret violations ONLY
      if (violations && Array.isArray(violations) && violations.includes('Secrets')) {
        logger.info('Secret violations detected in result');
        hasSecrets = true;
      }
      
      // Only block if we actually found secrets, not for prompt injection or other violations
      if (hasSecrets) {
        logger.warn('Blocking content due to actual secrets found');
      } else if (action === 'block') {
        logger.info('API wants to block content, but no secrets found - allowing through');
        logger.debug('Non-secret violations:', violations || 'policy violations');
        
        // Log the violations but don't treat as secrets
        if (violations && violations.length > 0) {
          logger.info('Non-blocking violations detected:', violations.join(', '));
        }
      }

      return {
        secrets: hasSecrets, // ONLY flag actual secrets, not prompt injection
        findings,
        action: hasSecrets ? 'block' : 'allow', // Override action based on actual secrets
        scannedAt: new Date().toISOString(),
        apiVersion: result.version || '1.0'
      };
    } catch (error) {
      logger.error('Error mapping API response:', error);
      
      // Return a safe default response
      return {
        secrets: false,
        findings: [],
        action: 'allow',
        scannedAt: new Date().toISOString(),
        error: 'Failed to parse API response'
      };
    }
  }
}

module.exports = PromptSecurityClient; 