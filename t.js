const ngrok = require('ngrok');
(async function() {
  try {
    await ngrok.kill();
    const url = await ngrok.connect(3000);
    console.log("NGROK URL:", url);
  } catch(e) {
    console.error(e);
  }
})();
