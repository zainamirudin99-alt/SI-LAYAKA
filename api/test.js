module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    const rpc = require('./rpc.js');
    res.status(200).json({
      success: true,
      message: 'api/rpc.js loaded successfully!',
      type: typeof rpc
    });
  } catch (err) {
    res.status(200).json({
      success: false,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack
    });
  }
};
