const http = require('http');
const app = require('./app');
const { initSockets } = require('./sockets');

const port = process.env.PORT || 4000;
const httpServer = http.createServer(app);

initSockets(httpServer);

httpServer.listen(port, () => {
  console.log(`Food Politics server listening on port ${port}`);
});
