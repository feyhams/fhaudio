/**
 * FH Audio - Vercel Serverless Audio Fetch Bridge
 * Allows mobile & cloud users on fhaudio.vercel.app to fetch YouTube audio directly into Waveform Studio.
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const apiUrl = `https://loader.to/ajax/download.php?format=mp3&url=${encodeURIComponent(url)}`;
    const initRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!initRes.ok) {
      return res.status(502).send('Failed to initiate conversion');
    }

    const initData = await initRes.json();
    if (!initData.progress_url) {
      return res.status(502).send('Invalid response from converter');
    }

    let downloadUrl = '';
    // Poll converter progress every 1.5s (up to ~20 seconds)
    for (let i = 0; i < 14; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const progRes = await fetch(initData.progress_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (progRes.ok) {
        const progData = await progRes.json();
        if (progData.success === 1 && progData.download_url) {
          downloadUrl = progData.download_url;
          break;
        }
      }
    }

    if (!downloadUrl) {
      return res.status(504).send('Conversion timed out');
    }

    // Fetch the audio stream and pipe to client
    const audioRes = await fetch(downloadUrl);
    if (!audioRes.ok) {
      return res.status(502).send('Failed to stream audio');
    }

    const contentType = audioRes.headers.get('content-type') || 'audio/mpeg';
    const contentLength = audioRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send(`Error: ${err.message}`);
  }
};
