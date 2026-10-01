/**
 * FH Audio - Vercel Serverless Check Operation & Moderation Status
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const apiKey = data.apiKey || '';
    const opPath = data.operationPath || '';
    let assetId = String(data.assetId || '').trim();

    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'Missing apiKey' });
    }

    let done = false;
    let rawMod = '';
    let status = 'reviewing';

    if (opPath) {
      try {
        const chkRes = await fetch(`https://apis.roblox.com/assets/v1/${opPath}`, {
          headers: { 'x-api-key': apiKey }
        });
        if (chkRes.ok) {
          const chkJson = await chkRes.json();
          done = chkJson.done || false;
          if (chkJson.error) {
            return res.status(200).json({
              success: true,
              done: true,
              assetId: '',
              status: 'rejected',
              error: chkJson.error.message || 'Roblox operation failed'
            });
          }

          const respObj = chkJson.response || {};
          if (!assetId && respObj.assetId) {
            assetId = String(respObj.assetId).trim();
          }
          rawMod = (respObj.moderationResult && respObj.moderationResult.moderationState) || '';
        }
      } catch (_) {}
    }

    if (assetId) {
      try {
        const liveRes = await fetch(`https://apis.roblox.com/assets/v1/assets/${assetId}`, {
          headers: { 'x-api-key': apiKey }
        });
        if (liveRes.ok) {
          const liveJson = await liveRes.json();
          const liveMod = liveJson.moderationResult && liveJson.moderationResult.moderationState;
          if (liveMod) {
            rawMod = liveMod;
            done = true;
          }
        }
      } catch (_) {}
    }

    const rawLower = (rawMod || '').toLowerCase();
    if (!done || rawLower.includes('reviewing')) {
      status = 'reviewing';
    } else if (rawLower.includes('approved')) {
      status = 'approved';
    } else if (rawLower.includes('rejected') || rawLower.includes('blocked')) {
      status = 'rejected';
    } else {
      status = 'reviewing';
    }

    return res.status(200).json({
      success: true,
      done,
      assetId,
      status,
      rawModeration: rawMod
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
