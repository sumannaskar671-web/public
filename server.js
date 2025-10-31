const express = require('express');
const { hubcloudExtracter } = require('./extractor');

const app = express();
const port = 10000;

// Middleware to parse URL-encoded bodies (for form data) and JSON bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Main API endpoint
app.get('/api/hubcloud', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      success: false,
      message: 'Missing "url" query parameter.',
    });
  }

  try {
    // Note: AbortController is not strictly necessary for this simple API but 
    // is included to match the original function signature.
    const controller = new AbortController();
    const signal = controller.signal;
    
    const links = await hubcloudExtracter(url, signal);

    const response = {
      links: links,
      success: true,
      count: links.length,
      source: 'custom-hubcloud-api',
    };

    res.json(response);
  } catch (error) {
    console.error('API Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'An error occurred during extraction.',
      error: error.message,
    });
  }
});

// Simple health check or root message
app.get('/', (req, res) => {
  res.send('Hubcloud Extractor API is running. Use /api/hubcloud?url=YOUR_LINK');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
