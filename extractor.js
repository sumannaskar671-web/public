const axios = require('axios');
const cheerio = require('cheerio');

// Adapted from headers.ts
const headers = {
  'sec-ch-ua':
    '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
};

// The decode function from hubcloudExtractor.ts
const decode = function (value) {
  if (value === undefined) {
    return '';
  }
  // atob is available in Node.js >= 16.0.0, but we'll use Buffer for compatibility
  try {
    return Buffer.from(value.toString(), 'base64').toString('binary');
  } catch (e) {
    // Fallback or error handling if base64 decoding fails
    return '';
  }
};

/**
 * Extracts streaming links from a hubcloud link.
 * @param {string} link The hubcloud link to extract from.
 * @param {AbortSignal} signal AbortSignal for request cancellation (optional in this context).
 * @returns {Promise<Array<{server: string, link: string, type: string}>>}
 */
async function hubcloudExtracter(link, signal) {
  try {
    const baseUrl = link.split('/').slice(0, 3).join('/');
    const streamLinks = [];
    
    // 1. Fetch the initial link
    const vLinkRes = await axios.get(link, {headers, signal});
    const vLinkText = vLinkRes.data;
    const $vLink = cheerio.load(vLinkText);
    
    // 2. Find the redirect link
    const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || [];
    
    let vcloudLink =
      decode(vLinkRedirect[1]?.split('r=')?.[1]) ||
      vLinkRedirect[1] ||
      $vLink('.fa-file-download.fa-lg').parent().attr('href') ||
      link;

    if (vcloudLink?.startsWith('/')) {
      vcloudLink = `${baseUrl}${vcloudLink}`;
    }

    // 3. Follow the redirect link (vcloudLink)
    // Using fetch with 'follow' redirect is closer to the original TS code, 
    // but axios handles redirects by default. Let's stick to axios for simplicity 
    // and use the original logic's headers and signal.
    const vcloudRes = await axios.get(vcloudLink, {
        headers,
        signal,
        maxRedirects: 5 // Ensure redirects are followed
    });
    
    const $ = cheerio.load(vcloudRes.data);

    // 4. Extract final links from the vcloud page
    const linkClass = $('.btn-success.btn-lg.h6,.btn-danger,.btn-secondary');
    
    for (const element of linkClass) {
      const itm = $(element);
      let extractedLink = itm.attr('href') || '';
      
      if (extractedLink) {
        // The original code has complex logic for different link types. 
        // We need to replicate this logic as closely as possible.
        
        // --- Cf Worker / pixeldrain.dev logic ---
        if (extractedLink?.includes('.dev') && !extractedLink?.includes('/?id=')) {
          streamLinks.push({server: 'Cf Worker', link: extractedLink, type: 'mkv'});
        }
        
        // --- Pixeldrain logic ---
        if (extractedLink?.includes('pixeld')) {
          if (!extractedLink?.includes('api')) {
            const token = extractedLink.split('/').pop();
            const baseUrl = extractedLink.split('/').slice(0, -2).join('/');
            extractedLink = `${baseUrl}/api/file/${token}?download`;
          }
          streamLinks.push({server: 'Pixeldrain', link: extractedLink, type: 'mkv'});
        }
        
        // --- hubcloud / /?id= logic ---
        if (extractedLink?.includes('hubcloud') || extractedLink?.includes('/?id=')) {
          try {
            // The original code uses axios.head and checks responseURL for a final link.
            // This is a crucial step to resolve the final streaming link.
            const newLinkRes = await axios.head(extractedLink, {headers, signal, maxRedirects: 0, validateStatus: status => status >= 200 && status < 400});
            // The original code's logic for extracting the final link is complex due to how redirects work in different environments.
            // In a simple Node.js environment, the final URL is usually in the 'location' header of the 302 redirect.
            // Since the original code uses axios.head and checks `newLinkRes.request?.responseURL`, 
            // we'll assume the final link is in the Location header if a redirect occurs, or the original link if not.
            
            let finalLink = extractedLink;
            if (newLinkRes.headers.location) {
                // If there's a redirect, the final link is in the location header
                const location = newLinkRes.headers.location;
                // Check if the final link contains 'link=' parameter as in the original code
                finalLink = location.includes('link=') ? location.split('link=')[1] : location;
            }
            
            streamLinks.push({server: 'hubcloud', link: finalLink, type: 'mkv'});
          } catch (error) {
            // If the HEAD request fails (e.g., due to a non-followed redirect), 
            // the original link might still be the one needed. Let's push the original link.
            // The original code logs the error and continues.
            // console.log('hubcloudExtracter error in hubcloud link: ', error.message);
            // streamLinks.push({server: 'hubcloud', link: extractedLink, type: 'mkv'}); // Re-adding the link here might be redundant, but safe.
          }
        }
        
        // --- cloudflarestorage logic ---
        if (extractedLink?.includes('cloudflarestorage')) {
          streamLinks.push({server: 'CfStorage', link: extractedLink, type: 'mkv'});
        }
        
        // --- fastdl logic ---
        if (extractedLink?.includes('fastdl')) {
          streamLinks.push({server: 'FastDl', link: extractedLink, type: 'mkv'});
        }
        
        // --- hubcdn logic ---
        if (extractedLink.includes('hubcdn')) {
          streamLinks.push({
            server: 'HubCdn',
            link: extractedLink,
            type: 'mkv',
          });
        }
      }
    }

    return streamLinks;
  } catch (error) {
    console.error('hubcloudExtracter error: ', error.message);
    return [];
  }
}

module.exports = { hubcloudExtracter };
