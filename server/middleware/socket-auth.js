const jwt = require('jsonwebtoken');

function authenticateSocket(socket, next) {
    // The token is sent in the 'auth' object during connection
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error('Authentication error: No token provided.'));
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return next(new Error('Authentication error: Invalid token.'));
        }
        // Attach the decoded user payload to the socket object
        socket.user = decoded;
        next();
    });
}

module.exports = authenticateSocket;
