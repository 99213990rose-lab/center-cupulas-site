// Redirect to the published catalogue without tracking visitors who have not
// opted into analytics. Optional measurement is handled by the consent-aware UI.
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end();
  }
  res.setHeader('Location', '/catalogo.pdf');
  res.statusCode = 302;
  return res.end();
};
