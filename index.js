// Web Socket Server

import { requestNewTriviaGame } from "./triviaAPI.js";
import http from "http";
import websocket from "websocket";
//import fs from "fs";
//import { WebSocketServer } from 'ws';

// TODO: create https server -> secure websockets
/*const options = {
  key: fs.readFileSync('test/fixtures/keys/agent2-key.pem'),
  cert: fs.readFileSync('test/fixtures/keys/agent2-cert.pem'),
};*/

// TODO: testing using 'ws' library
/*const PORT = process.env.PORT || 9090;
const wsServer = new WebSocketServer({ port: PORT });
wsServer.on('connection', ws => {
  ws.on('message', message => {
    console.log(`Received message => ${message}`)
  })
  ws.send('Hello! Message From Server!!')
})*/

const websocketServer = websocket.server;
const httpServer = http.createServer();
const PORT = process.env.PORT || 9090;
httpServer.listen(PORT, () => console.log(`Listening... on ${PORT}`));
const wsServer = new websocketServer({
    "httpServer": httpServer
});


//hashmap clients
const rooms = {}; // NOTE: 'rooms' previously 'games'
const clients = {}; //  Stores client connections (TODO: also, scores, and username(?))
// TODO: have to think about this carefully, how to manage multiple
// rooms.
// Make objects for client, room, etc.: specify attributes, e.g. username for client
const maxClients = 12;

// Prompt host for Category, Difficulty, Amount of questions
//requestTriviaGame("General Knowledge", "something", 50);
function gameDataHandler(triviaData) {
  console.log(triviaData);
}

wsServer.on("request", request => {
    //connect
    const connection = request.accept(null, request.origin);
    connection.on("open", () => console.log("opened!"))
    connection.on("close", () => console.log("closed!"))
    connection.on("message", message => {
        const result = JSON.parse(message.utf8Data);
        // CREATE ROOM METHOD
        if (result.method === "createRoom") {
          createRoomHandler(result);
        }
        // JOIN ROOM METHOD
        if (result.method === "joinRoom") {
          joinRoomHandler(result);
        }
        // RECONNECT TO ROOM
        if (result.method === "reconnect") {
          reconnectHandler(result);
        }
        // SEND ANSWER METHOD
        if (result.method === "play") {

        }
        // SEND CHAT MESSAGE METHOD
        if (result.method === "chat") {
          chatHandler(result);
        }
    })
    connectClientResponse(connection);
    // TODO: DELETE BELOW, TESTING WITH FORCED DISCONNECT
    /*setTimeout(() => {
      connection.close();
    }, 3000);*/
})



/* -------------------------- WS REQ/RES HANDLERS -------------------------- */

// TODO: Add error code if create room fails, sever connection
function createRoomHandler(result) {
  const hostId = result.clientId;
  const clientUsername = result.clientUsername;
  const roomCode = uniqueRoomCode();
  console.log(roomCode)
  rooms[roomCode] = {
    "roomCode": roomCode,
    "hostId": hostId,
    "clients": [hostId]
  }
  clients[hostId].username = clientUsername;
  // Send back roomCode
  let usersScores = getUsersScores(roomCode);
  const payLoad = {
    "method": "createRoom",
    "roomCode": roomCode,
    "usersScores": usersScores
  }
  clients[hostId].connection.send(JSON.stringify(payLoad));
}

function joinRoomHandler(result) {
  const clientId = result.clientId;
  const clientUsername = result.clientUsername;
  const roomCode = result.roomCode;
  // If room found, update paramters and relevant globals
  if (roomCode in rooms) {
    clients[clientId].username = clientUsername;
    rooms[roomCode].clients.push(clientId);
    let usersScores = getUsersScores(roomCode);
    const payLoad = {
      "method": "joinRoom",
      "joinedClientId": clientId,
      "joinedClientUsername": clientUsername,
      "usersScores": usersScores,
      "errMsg": ""
    }
    // TODO: SEND LIST OF ALL USERNAMES ON ANY CLIENT JOIN, AND ON RECONNECTS
    rooms[roomCode].clients.forEach(clientId => {
      clients[clientId].connection.send(JSON.stringify(payLoad));
    })
    // TODO: REMOVE -- TESTING
    console.log("Room size: ", rooms[roomCode].clients.length)
  }
  else {
    const payLoad = {
      "method": "joinRoom",
      "joinedClientId": "",
      "joinedClientUsername": "",
      "usersScores": {},
      "errMsg": "Room Not Found"
    }
    clients[clientId].connection.send(JSON.stringify(payLoad));
    clients[clientId].connection.close(); // TODO: CONSIDER USING .CLOSE(CODE,REASON) HERE
    delete clients[clientId];
  }
}

// NOTE: CURRENT CLIENT RECONNECT IMPLEMENTATION: client is connected to another socket
// but client data in clients{} and client reference in room{} persists ...
// Set clients[clientId (original)] = clients[tempId]
// delete clients[tempId]
function reconnectHandler(result) {
  const originalClientId = result.originalClientId;
  const tempClientId = result.tempClientId;
  const clientUsername = result.clientUsername;
  const roomCode = result.roomCode;
  // TODO: REMOVE BELOW -- TESTING
  //console.log(`Client ${clientUsername} w/ ID: ${originalClientId} reconnecting w/ tempID: ${tempClientId}`)
  // Verify clientId<->room mapping exists, i.e. prev. client trying to reconnect
  let recipientClientId = tempClientId;
  // Send back response
  const payLoad = {
    "method": "reconnect",
    "recipientClientId": recipientClientId,
    "usersScores": {},
    "errMsg": "Failed to reconnect"
  }
  // TODO/FIX: RECONNECT BUG HAPPENS HERE, WHEN CLIENTID IS IN SESSION STORAGE
  // FROM PREVIOUS ROOM SO ROOMCODE IS FOUND BUT OLD CLIENTID IS NOT LINKED
  if (!(roomCode in rooms)) {
    payLoad.errMsg = "Invalid roomcode."
  }
  else if (!(rooms[roomCode].clients.includes(originalClientId))) {
    payLoad.errMsg = "Client Id not found."
  }
  else {
    // Re-map new client connection to original clientId
    // rooms map has persistent data associated with original id. Leave as-is.
    payLoad.errMsg = "";
    clients[originalClientId].connection = clients[tempClientId].connection;
    delete clients[tempClientId];
    recipientClientId = originalClientId;
    payLoad.recipientClientId = recipientClientId;
    let usersScores = getUsersScores(roomCode);
    payLoad.usersScores = usersScores;
    // TODO: REMOVE -- TESTING
    console.log("Room size: ", rooms[roomCode].clients.length)
  }
  clients[recipientClientId].connection.send(JSON.stringify(payLoad));
}

// TODO: NEED TO SERVER CURRENT GAME STATE IF CURRENTLY IN GAME
// TODO: VERIFY USER IS IN THIS ROOM?
function chatHandler(result) {
  const roomCode = result.roomCode;
  const msgSenderId = result.clientId;
  const msgSenderName = result.clientDisplayName; // how name should be displayed
  const chatMsg = result.chatMsg;
  const type = result.type;
  // TODO: REMOVE SCORES STUFF -- TESTING
  const payLoad = {
    "method": "chat",
    //"senderId": msgSenderId,
    "senderName": msgSenderName,
    "chatMsg": chatMsg,
    "type": type
  }
  //Loop through all non-self clients and send chat message
  rooms[roomCode].clients.forEach(clientId => {
    if (clientId !== msgSenderId) {
      clients[clientId].connection.send(JSON.stringify(payLoad));
    }
  })
}

function connectClientResponse(connection) {
  //generate a new clientId
  const clientId = uuid();
  clients[clientId] = {
      "connection":  connection,
      "username": "",
      "gameScore": 0
  }
  const payLoad = {
      "method": "connect",
      "clientId": clientId
  }
  //send back the client connect
  connection.send(JSON.stringify(payLoad))

  // Testing
  // NOTE/TODO: ON CONNECTION CLOSE, REF. TO CONNECTION STILL SAVED. LIMIT TO NUMBER OF CONNECTIONS?
  var size = Object.keys(clients).length;
  console.log("Clients size: ", size);
}



/* ------------------------- GET CLIENT INFORMATION -------------------------  */

// Get map of client username to current score.
// Send after every new room join and game round to all clients, and after rejoin
// to reconnecting client.
function getUsersScores(roomCode) {
  let scoresMap = {};
  rooms[roomCode].clients.forEach(clientId => {
    let username = clients[clientId].username;
    let score = clients[clientId].gameScore;
    scoresMap[username] = score;
  })
  return scoresMap;
}



/* ----------------- GENERATE CLIENT ID, ROOM CODE HELPERS ----------------- */

// Create uuid unique identifier
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  .replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0,
      v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Generate random 4-letter room code for clients to join
function uniqueRoomCode() {
  let uniqueRoomCode = genNewRoomCode();
  while(uniqueRoomCode in rooms) {
    uniqueRoomCode = genNewRoomCode();
  }
  //console.log("Number of Rooms: ", Object.keys(clients).length);
  return uniqueRoomCode
}
function genNewRoomCode() {
  let roomCode = "";
  for (var i=0; i<4; i++) {
    let randLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    roomCode += randLetter;
  }
  return roomCode;
}


export { gameDataHandler };
