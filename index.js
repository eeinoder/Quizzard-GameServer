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

const rooms = {}; // NOTE: 'rooms' previously 'games'
// e.g. room[roomCode] = {
//  "roomCode": roomCode,
//  "hostId": hostId,
//  "clients": [hostId],
//  "gameState": "setup"
//}
const games = {}; // Game Data: title, questions/answers, current questions
// e.g. games[gameCode] = {     // NOTE: one game per room at a time, so just make gameCode = roomCode
//  "gameCode": gameCode,
//  "gameParams": [gameTitle, gameQuestionNum, gameDifficulty, gameColor],
//  "gameData": []
//}
const clients = {}; //  Stores client connections (TODO: also, scores, and username(?))
// e.g. clients[clientId] = {
//    "connection":  connection,
//    "username": "",
//    "isInGame": false,
//    "gameScore": 0
//}

const maxClients = 12;


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
        // CREATE GAME METHOD
        if (result.method === "createGame") {
          createGameHandler(result)
        }
        // QUIT GAME HANDLER
        if (result.method === "quitGame") {
          quitGameHandler(result);
        }
        // JOIN GAME METHOD
        if (result.method === "joinGame") {
          joinGameHandler(result);
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
    "clients": [hostId],
    "gameState": "setup"
  }
  clients[hostId].username = clientUsername;
  clients[hostId].isInGame = true;
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
    let usersInGame = getUsersInGame(roomCode);
    let gameState = rooms[roomCode].gameState;
    let gameParams = [];
    if (roomCode in games) {
      gameParams = games[roomCode].gameParams;
    }
    const payLoad = {
      "method": "joinRoom",
      "joinedClientId": clientId,
      "joinedClientUsername": clientUsername,
      "usersScores": usersScores,
      "usersInGame": usersInGame,
      "gameState": gameState,
      "gameParams": gameParams,
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
      "usersInGame": {},
      "gameState": "",
      "gameParams": [],
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
    "usersInGame": {},
    "gameState": "",
    "gameParams": [],
    "errMsg": "Failed to reconnect."
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
    // (Re)send other join-status users' data, game state data
    payLoad.usersScores = getUsersScores(roomCode);
    payLoad.usersInGame = getUsersInGame(roomCode);
    payLoad.gameState = rooms[roomCode].gameState;
    if (roomCode in games) {
      payLoad.gameParams = games[roomCode].gameParams;
    }
    // TODO: REMOVE -- TESTING
    console.log("Room size: ", rooms[roomCode].clients.length)
  }
  clients[recipientClientId].connection.send(JSON.stringify(payLoad));
}

// Create new game
function createGameHandler(result) {
  const clientId = result.clientId;
  const roomCode = result.roomCode;
  const gameParams = result.gameParams;
  //let [gameTitle, gameQuestionNum, gameDifficulty, gameColor] = gameParams;
  const payLoad = {
    "method": "createGame",
    "gameParams": gameParams,
    "gameState": "setup",             // NOTE: default state, change to "join"
    "joinedUsers": {},
    "errMsg": "Failed to create game." // NOTE: default err message
  }
  // Verify requesting client is room host
  if (clientId !== rooms[roomCode].hostId) {
    payLoad.errMsg = "Only host can create game."
    clients[clientId].connection.send(JSON.stringify(payLoad));
  }
  else {
    // Request for trivia game data. Response handled in gameDataHandler.
    requestNewTriviaGame(gameParams, roomCode);
  }
}
// OpenTDB Trivia Data Response handler
function gameDataHandler(triviaData, gameParams, roomCode) {
  // Create payLoad
  const payLoad = {
    "method": "createGame",
    "gameParams": gameParams,
    "gameState": "setup",             // NOTE: default state, change to "join"
    "joinedUsers": {},
    "errMsg": "Failed to get trivia data." // NOTE: default err message
  }
  // Successfully got trivia data
  if (triviaData.response_code === 0) {
    createNewGame(triviaData.results, gameParams, roomCode);
    payLoad.gameState = rooms[roomCode].gameState;
    payLoad.joinedUsers = getUsersInGame(roomCode);
    payLoad.errMsg = "";
  }
  // Send to all clients
  rooms[roomCode].clients.forEach(clientId => {
    clients[clientId].connection.send(JSON.stringify(payLoad));
  })
}

// Quit Game Handler
function quitGameHandler(result) {
  const clientId = result.clientId;
  const roomCode = result.roomCode;
  const payLoad = {
    "method": "quitGame",
    "gameState": "join",    // Default state if quit game fails
    "errMsg": ""
  }
  // Verify room exists
  if (!(roomCode in rooms)) {
    payLoad.errMsg = "Invalid roomcode."
  }
  // Verify requesting client is room host
  else if (clientId !== rooms[roomCode].hostId) {
    payLoad.errMsg = "Only host can quit game."
    clients[clientId].connection.send(JSON.stringify(payLoad));
  }
  // Verify game exists
  else if (!(roomCode in games)) {
    payLoad.errMsg = "Game does not exist."
  }
  // Quit game -- Reset users inGame flag, set game state, delete game object
  else {
    quitGame(roomCode);
    payLoad.gameState = rooms[roomCode].gameState;
  }
  // Send to all clients
  rooms[roomCode].clients.forEach(clientId => {
    clients[clientId].connection.send(JSON.stringify(payLoad));
  })
}

// Join Game Handler
function joinGameHandler(result) {
  const clientId = result.clientId;
  const clientUsername = result.clientUsername;
  const roomCode = result.roomCode;
  const payLoad = {
    "method": "joinGame",
    "joinedGameList": {},
    "joinedGameClientId": "",
    "joinedGameUser": "",
    "gameParams": [],
    "errMsg": ""
  }
  // Verify room exists
  if (!(roomCode in rooms)) {
    payLoad.errMsg = "Invalid roomcode."
  }
  // Verify client in this room
  else if (!(rooms[roomCode].clients.includes(clientId))) {
    payLoad.errMsg = "Client Id not found."
  }
  // Verify game exists
  else if (!(roomCode in games)) {
    payLoad.errMsg = "Game does not exist."
  }
  // Add user to game joined list
  else {
    clients[clientId].isInGame = true;
    payLoad.joinedGameClientId = clientId;
    payLoad.joinedGameUser = clientUsername;
    payLoad.joinedGameList = getUsersInGame(roomCode);
    payLoad.gameParams = games[roomCode].gameParams;
  }
  // Send payload to every user if successful, or just requesting client if not
  if (payLoad.errMsg === "") {
    rooms[roomCode].clients.forEach(clientId => {
      clients[clientId].connection.send(JSON.stringify(payLoad));
    })
  }
  else {
    clients[clientId].connection.send(JSON.stringify(payLoad));
  }
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
      "isInGame": false,
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



/* ------------------------- GET/SET GAME INFORMATION -------------------------  */

function createNewGame(triviaDataList, gameParams, roomCode) {
  // Reset user isInGame state
  resetUsersInGame(roomCode);
  // Add host to joined users by default
  let hostId = rooms[roomCode].hostId;
  clients[hostId].isInGame = true;
  // Create new game object in games
  games[roomCode] = {
    "gameCode": roomCode,
    "gameParams": gameParams,
    "gameData": triviaDataList
  }
  // Update room game state on successful create game
  rooms[roomCode].gameState = "join";
}

function quitGame(roomCode) {
  // Reset user isInGame state
  resetUsersInGame(roomCode);
  // Delete game object
  delete games[roomCode];
  // Update room game state on successful quit game
  rooms[roomCode].gameState = "setup";
}

/* ------------------------- GET/SET CLIENT INFORMATION -------------------------  */

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

function getUsersInGame(roomCode) {
  let usersInGame = {};
  rooms[roomCode].clients.forEach(clientId => {
    let username = clients[clientId].username;
    let isInGame = clients[clientId].isInGame;
    usersInGame[username] = isInGame;
  })
  return usersInGame;
}

function resetUsersInGame(roomCode) {
  rooms[roomCode].clients.forEach(clientId => {
    clients[clientId].isInGame = false;
  })
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
