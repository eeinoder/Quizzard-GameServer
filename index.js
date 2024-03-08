// Web Socket Server

import { requestNewTriviaGame } from "./triviaAPI.js";
import http from "http";
import websocket from "websocket";
import { readFile } from "fs/promises";
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

const rooms = {};
// e.g. room[roomCode] = {
//  "roomCode": roomCode,
//  "hostId": hostId,
//  "clients": [hostId],        // NOTE: this should really be set/map/object not array
//  "takenUsernames": {...},    // Usernames must be unique. This used for verfication.
//                              // takenUsernames[username] = clientId
//  "gameState": "setup",
//  "gameSessionToken": "..."   // Session token for calls to OpenTDB -> no duplicate questions
//}
const games = {}; // Game Data: title, questions/answers, current questions
// e.g. games[gameCode] = {     // NOTE: one game per room at a time, so just make gameCode = roomCode
//  "gameCode": gameCode,
//  "gameParams": { "gameTitle":, "gameQuestionNum":, "gameDifficulty":, "gameColor": },
//  "gameQAData": [],           // Results array from OpenTDB response with question data objects
//  "timerTime": 10000,         // Time to answer question in ms, default 10s
//  "currQuestionNum": 0,
//  "currTimerEnd": 0,          // When current question timer will elapse in ms, = Date.now() + T, T=10s by default
//  "currQuestion": "...",      // String of currrent question
//  "currAnswerOptions": [...], // Array with answer options
//  "clientAnswers": {...},     // Map (object) of clientIds to answer string given for current question
//  "clientResults": {...},      // Map (object) of clientIds to result, "true"/"false", right or wrong
//  "numClientsPlaying": 0
//}
const clients = {}; //  Stores client connections (TODO: also, scores, and username(?))
// e.g. clients[clientId] = {
//    "connection":  connection,
//    "username": "",
//    "isPlaying": false,
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
        // START GAME ROUND HANDLER
        if (result.method === "startGameRound") {
          startGameRoundHandler(result);
        }
        // JOIN GAME METHOD
        if (result.method === "joinGame") {
          joinGameHandler(result);
        }
        if (result.method === "leaveGame") {
          leaveGameHandler(result);
        }
        // SEND ANSWER METHOD
        if (result.method === "play") {
          playHandler(result);
        }
        // SEND CHAT MESSAGE METHOD
        if (result.method === "chat") {
          chatHandler(result);
        }
        // KICK USER METHOD
        if (result.method === "kickUser") {
          kickUserHandler(result);
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
    "takenUsernames": {},
    "gameState": "setup",
    "gameSessionToken": ""
  }
  clients[hostId].username = clientUsername;
  rooms[roomCode].takenUsernames[clientUsername] = hostId;
  // Send back roomCode
  let usersScores = getUsersScores(roomCode);
  const payLoad = {
    "method": "createRoom",
    "roomCode": roomCode,
    "usersScores": usersScores
  }
  clients[hostId].connection.send(JSON.stringify(payLoad));
  // TODO: closeDummyConnections();
}

function joinRoomHandler(result) {
  const clientId = result.clientId;
  const clientUsername = result.clientUsername;
  const roomCode = result.roomCode;

  const payLoad = {
    "method": "joinRoom",
    "joinedClientId": "",
    "joinedClientUsername": "",
    "usersScores": {},
    "usersInGame": {},
    "gameState": "",
    "gameData": {},
    "joinErrs": {},
    "errMsg": "Join Failed"
  }

  // Verify room exists
  if (!(roomCode in rooms)) {
    payLoad.joinErrs["codeErr"] = "Room Not Found";
    clients[clientId].connection.send(JSON.stringify(payLoad));
    //clients[clientId].connection.close(); // TODO: CONSIDER USING .CLOSE(CODE,REASON) HERE
    delete clients[clientId];
  }
  // Verify username is unique
  else if (clientUsername in rooms[roomCode].takenUsernames) {
    payLoad.joinErrs["nameErr"] = "Username Taken";
    clients[clientId].connection.send(JSON.stringify(payLoad));
    //clients[clientId].connection.close(); // TODO: CONSIDER USING .CLOSE(CODE,REASON) HERE
    delete clients[clientId];
  }
  // Otherwise, update paramters and relevant globals
  else {
    clients[clientId].username = clientUsername;
    rooms[roomCode].takenUsernames[clientUsername] = clientId;
    rooms[roomCode].clients.push(clientId);
    // Build payload
    payLoad.joinedClientId = clientId;
    payLoad.joinedClientUsername = clientUsername;
    payLoad.usersScores = getUsersScores(roomCode);
    payLoad.usersInGame = getUsersInGame(roomCode); // NOTE: use this instead of gameData value, game doesn't exist yet
    payLoad.gameState = rooms[roomCode].gameState;  //  Can use reference in other responses after gameData created.
    payLoad.errMsg = "";
    if (roomCode in games) {
      payLoad.gameData = getCurrentGameData(roomCode);
    }
    // TODO: SEND LIST OF ALL USERNAMES ON ANY CLIENT JOIN, AND ON RECONNECTS
    rooms[roomCode].clients.forEach(clientId => {
      clients[clientId].connection.send(JSON.stringify(payLoad));
    })
    // TODO: REMOVE -- TESTING
    console.log("Room size: ", rooms[roomCode].clients.length)
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
  let reconnectingClientId = tempClientId;
  // Send back response
  const payLoad = {
    "method": "reconnect",
    "reconnectingClientId": reconnectingClientId,
    "usersScores": {},
    "usersInGame": {},
    "gameState": "",
    "isPlaying": "",
    "gameData": {},
    "joinErrs": {},
    "errMsg": "Rejoin failed"
  }
  // Verify room exists
  if (!(roomCode in rooms)) {
    payLoad.joinErrs["codeErr"] = "Room not found";
    clients[tempClientId].connection.send(JSON.stringify(payLoad));
  }
  // Verify client id reference in this room
  else if (!(rooms[roomCode].clients.includes(originalClientId))) {
    payLoad.joinErrs["nameErr"] = "Connection not found"; // i.e. client if not found
    clients[tempClientId].connection.send(JSON.stringify(payLoad));
  }
  // Verify username is unique if client chose different username than original
  else if (clientUsername !== clients[originalClientId].username && clientUsername in rooms[roomCode].takenUsernames) {
    payLoad.joinErrs["nameErr"] = "Username Taken"; // i.e. client if not found
    clients[tempClientId].connection.send(JSON.stringify(payLoad));
  }
  else {
    // Re-map new client connection to original clientId
    // rooms map has persistent data associated with original id. Leave as-is.
    payLoad.errMsg = "";
    clients[originalClientId].connection = clients[tempClientId].connection;
    delete clients[tempClientId];
    reconnectingClientId = originalClientId;
    payLoad.reconnectingClientId = reconnectingClientId;
    // Update username in case it was changed
    let oldUserName = clients[originalClientId].username;
    if (clientUsername !== oldUserName) {
      clients[originalClientId].username = clientUsername;
      delete rooms[roomCode].takenUsernames[oldUserName];
      rooms[roomCode].takenUsernames[clientUsername] = originalClientId;
    }
    // (Re)send other join-status users' data, game state data
    payLoad.usersScores = getUsersScores(roomCode);
    payLoad.usersInGame = getUsersInGame(roomCode);
    payLoad.gameState = rooms[roomCode].gameState;
    payLoad.isPlaying = clients[originalClientId].isPlaying;
    // Send game data
    if (roomCode in games) {
      payLoad.gameData = getCurrentGameData(roomCode);
    }
    // Send to all clients -> update scores and join lists
    // For reconnecting client, update current game state and load game data
    rooms[roomCode].clients.forEach(clientId => {
      clients[clientId].connection.send(JSON.stringify(payLoad));
    })
    // TODO: REMOVE -- TESTING
    console.log("Room size: ", rooms[roomCode].clients.length)
  }
}

// Create new game
function createGameHandler(result) {
  const clientId = result.clientId;
  const roomCode = result.roomCode;
  const gameParams = result.gameParams;
  const payLoad = {
    "method": "createGame",
    "gameState": "setup",             // NOTE: default state, change to "join"
    "joinedUsers": {},
    "isPlaying": "",
    "usersScores": {},
    "gameData": {},
    "errMsg": "Failed to create game." // NOTE: default err message
  }
  // Verify requesting client is room host
  if (clientId !== rooms[roomCode].hostId) {
    payLoad.errMsg = "Only host can create game."
    clients[clientId].connection.send(JSON.stringify(payLoad));
  }
  else {
    // TODO: FIX/REMOVE -- TEMPORARY MEASURE TO ALLOW FOR TESTING WHEN OpenTDB IS DOWN
    // MAYBE HAVE BETTER "OFFLINE" AS FULL FEATURE IN FUTURE
    let gameSessionToken = rooms[roomCode].gameSessionToken;
    if (gameParams.gameTitle === "GK Offline") {
      console.log("Retreiving local trivia data")
      readLocalTriviaData(gameParams, roomCode);
    }
    else {
      console.log("Fetching OpenTDB trivia data")
      // Request for trivia game data. Response handled in gameQADataHandler.

      // NOTE: USING SESSION TOKENS
      // If gameSessionToken="", function call below generates new token.
      // On server-client error (fetching game data or token from requestNewTriviaGame),
      // reset session token (make empty). Display error. Next create game generates new
      // Non-zero error response codes either require new token or debuggin -> generate new token.
      requestNewTriviaGame(gameParams, roomCode, gameSessionToken);
    }
  }
}
// Read JSON file with example of opentdb trivia JSON response
async function readLocalTriviaData(gameParams, roomCode) {
  // Original request url: https://opentdb.com/api.php?amount=50&category=9&difficulty=medium
  // NOTE: GAME PARAMS JUST BEING PASSES, NOT BEING USED TO GET QUESTIONS
  // TODO: IMPLEMENT "OFFLINE" WHERE PARAMS DETERMINE WHAT JSON TO READ
  await readFile(new URL("./localTriviaData.json", import.meta.url))
    .then(textData => gameQADataHandler(JSON.parse(textData), gameParams, roomCode));
}
// OpenTDB Trivia Data Response handler
function gameQADataHandler(triviaData, gameParams, roomCode, gameSessionToken="", errMsg="") {
  // Create payLoad
  const payLoad = {
    "method": "createGame",
    "gameState": "setup",             // NOTE: default state, change to "join"
    "joinedUsers": {},
    "isPlaying": "",
    "usersScores": {},
    "gameData": {},
    "errMsg": "Failed to get questions. Trivia API Server may be down." // NOTE: default err message
  }
  // Read OpenTDB error response, ordered by index
  const triviaResponseCodes = [
    // response_code = 0 -- Continue
    "Success",
    // response_code = 1 -- Get new session token
    "No Results. Try creating a new game.",
    // response_code = 2 -- FIX ASAP, interal error: host sending request to OpenTDB with invalid parameter
    "Invalid Game Parameter",
    // response_code = 3 -- Get new session token
    "Session Token Not Found. Try creating a new game.",
    // response_code = 4 -- Get new session token
    "No More Questions! You may see familiar questions after creating a new game.",
    // response_code = 5 -- FIX ASAP, interal error: host sending too many requests, > 1 per 5s
    "Rate Limit Exceeded"
  ];
  // If new session token generated, update game session token
  if (gameSessionToken) {
    rooms[roomCode].gameSessionToken = gameSessionToken;
  }
  // Fetch request failed, likely a server issue
  if (errMsg !== "") {
    payLoad.errMsg = errMsg;
    // Send err response to host
    clients[rooms[roomCode].hostId].connection.send(JSON.stringify(payLoad));
    // Reset game session token
    rooms[roomCode].gameSessionToken = "";
  }
  // Received error response from OpenTDB
  else if (triviaData.response_code !== 0) {
    // TODO: retry trivia data fetch depending on response code, e.g. with new session token if required.
    payLoad.errMsg = triviaResponseCodes[triviaData.response_code];
    // Send err response to host
    clients[rooms[roomCode].hostId].connection.send(JSON.stringify(payLoad));
    // Reset game session token
    rooms[roomCode].gameSessionToken = "";
  }
  // Successfully got trivia data
  else {
    console.log("Server received trivia data")
    createNewGame(triviaData.results, gameParams, roomCode); // TODO: update gameSessionToken here, may be same token
    payLoad.gameState = rooms[roomCode].gameState;
    payLoad.joinedUsers = getUsersInGame(roomCode);
    payLoad.isPlaying = false;
    payLoad.usersScores = getUsersScores(roomCode);
    payLoad.gameData = getCurrentGameData(roomCode);
    payLoad.errMsg = "";
    // Send to all clients
    rooms[roomCode].clients.forEach(clientId => {
      clients[clientId].connection.send(JSON.stringify(payLoad));
    })
  }
}

// Quit Game Handler
function quitGameHandler(result) {
  const clientId = result.clientId;
  const roomCode = result.roomCode;
  const payLoad = {
    "method": "quitGame",
    "gameState": "join",    // Default state if quit game fails
    "isPlaying": true,
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
    payLoad.isPlaying = clients[clientId].isPlaying;
    payLoad.gameState = rooms[roomCode].gameState;
  }
  // Send to all clients
  rooms[roomCode].clients.forEach(clientId => {
    clients[clientId].connection.send(JSON.stringify(payLoad));
  })
}

// Start next game round
function startGameRoundHandler(result) {
  const clientId = result.clientId;
  const roomCode = result.roomCode;
  const payLoad = {
    "method": "startGameRound",
    "gameState": "join",          // If get next round fails, go to game join (?)
    "gameData": {},
    "errMsg": ""
  }
  // Verify room exists
  if (!(roomCode in rooms)) {
    payLoad.errMsg = "Invalid roomcode."
  }
  // Verify requesting client is room host
  else if (clientId !== rooms[roomCode].hostId) {
    payLoad.errMsg = "Only host can start game round."
    clients[clientId].connection.send(JSON.stringify(payLoad));
  }
  // Verify game exists
  else if (!(roomCode in games)) {
    payLoad.errMsg = "Game does not exist."
  }
  else {
    startGameRound(roomCode); // -> set to "play" state, increment game round
    payLoad.gameState = rooms[roomCode].gameState;
    payLoad.gameData = getCurrentGameData(roomCode);
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
    "isPlaying": false,
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
  // Verify client not already joined in game.
  else if (clients[clientId].isPlaying) {
    payLoad.errMsg = "Client already joined."
  }
  // Add user to game joined list
  else {
    joinGame(roomCode, clientId);
    payLoad.isPlaying = clients[clientId].isPlaying;
    payLoad.joinedGameClientId = clientId;
    payLoad.joinedGameUser = clientUsername;
    payLoad.joinedGameList = getUsersInGame(roomCode);
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

// Leave Game Handler
function leaveGameHandler(result) {
  const clientId = result.clientId;
  const clientUsername = result.clientUsername;
  const roomCode = result.roomCode;
  const payLoad = {
    "method": "leaveGame",
    "joinedGameList": {},
    "leftGameClientId": "",
    "leftGameUser": "",
    "buttonColor": "",
    "isPlaying": true,
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
  // Verify client is joined in game.
  else if (!clients[clientId].isPlaying) {
    payLoad.errMsg = "Client not joined."
  }
  // Remove user from game joined list
  else {
    leaveGame(roomCode, clientId);
    payLoad.isPlaying = clients[clientId].isPlaying;
    payLoad.joinedGameList = getUsersInGame(roomCode);
    payLoad.leftGameClientId = clientId
    payLoad.leftGameUser = clientUsername;
    payLoad.buttonColor = games[roomCode].gameParams.gameColor;
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

// Play Game (answer questions, etc.)
function playHandler(result) {
  // TODO: send back "received" message, display in play view
  const clientId = result.clientId;
  const clientUsername = result.clientUsername;
  const roomCode = result.roomCode;
  const answer = result.answer;
  const payLoad = {
    "method": "play",
    "clientId": clientId,
    "gameData": {},
    "errMsg": ""
  }
  // TODO: more robust Err handling
  // Verify client answer not already recorded
  if (clientId in games[roomCode].clientAnswers) {
    payLoad.errMsg = "Clients can only answer once."
  }
  // Verify client is playing, not spectating
  // (This is sanity check. Already verified on FE.)
  else if (!(clients[clientId].isPlaying)) {
    payLoad.errMsg = "Client is spectating. Answer not graded or recorded."
  }
  else {
    play(roomCode, clientId, answer);
    payLoad.gameData = getCurrentGameData(roomCode);
  }
  // Send back to sending client
  clients[clientId].connection.send(JSON.stringify(payLoad));
}

// Game Results handler (TODO: add host ability to force results page)
function gameResultsHandler(roomCode) {
  // TODO: if curr is last question -> handle
  // TODO: return usersscores, already updated in playHandler
  // NOTE: if user fails to answer in time, no entry in clientAnswers or clientResults
  //  Just handle results stats intuitively

  // Update room state
  rooms[roomCode].gameState = "results";
  const payLoad = {
    "method": "getResults",
    "gameState": "results",
    "gameData": getCurrentGameData(roomCode),
    "usersScores": getUsersScores(roomCode),
  }
  // Send to all clients
  rooms[roomCode].clients.forEach(clientId => {
    clients[clientId].connection.send(JSON.stringify(payLoad));
  })
}

// TODO: NEED TO SERVER CURRENT GAME STATE IF CURRENTLY IN GAME
// TODO: VERIFY USER IS IN THIS ROOM?
function chatHandler(result) {
  const roomCode = result.roomCode;
  const msgSenderId = result.clientId;
  const msgSenderName = result.clientDisplayName; // how name should be displayed
  const chatMsg = result.chatMsg;
  const type = result.type;
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

function kickUserHandler(result) {
  const roomCode = result.roomCode;
  const clientId = result.clientId;
  const kickedUsername = result.kickedUsername;
  const payLoad = {
    "method": "kickUser",
    "kickedUsername": "",
    "usersScores": [],
    "joinedGameList": {},
    "errMsg": "Kicked user failed"
  }
  // Verify room exists
  if (!(roomCode in rooms)) {
    payLoad.errMsg = "Room not found";
    clients[clientId].connection.send(JSON.stringify(payLoad));
  }
  // Verify host is attempting kick
  if (clientId !== rooms[roomCode].hostId) {
    payLoad.errMsg = "Only host can kick users."
    clients[clientId].connection.send(JSON.stringify(payLoad));
  }
  // Verify user is in room (and clientId found ?)
  if (!(kickedUsername in rooms[roomCode].takenUsernames)) {
    payLoad.errMsg = "User not found."
    clients[clientId].connection.send(JSON.stringify(payLoad));
  }
  else {
    // Delete all client references.
    kickUser(roomCode, kickedUsername);
    // Build payload
    payLoad.kickedUsername = kickedUsername;
    payLoad.usersScores = getUsersScores(roomCode);
    payLoad.joinedGameList = getUsersInGame(roomCode);
    payLoad.errMsg = "";
    // Send payload to all
    rooms[roomCode].clients.forEach(clientId => {
      clients[clientId].connection.send(JSON.stringify(payLoad));
    })
  }
}

function connectClientResponse(connection) {
  //generate a new clientId
  const clientId = uuid();
  clients[clientId] = {
      "connection":  connection,
      "username": "",
      "isPlaying": false,
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



/* ------------------------- GAME ACTION HANDLERS -------------------------  */

function createNewGame(triviaDataList, gameParams, roomCode) {
  // Reset user isPlaying state
  resetUsersInGame(roomCode);
  // Reset user scores
  resetUsersScores(roomCode);
  // Create new game object in games
  games[roomCode] = {
    "gameCode": roomCode,
    "gameParams": gameParams,
    "gameQAData": triviaDataList,
    "timerTime": 15000,
    "currQuestionNum": -1,
    "currTimerEnd": 0,
    "currQuestion": "",
    "currQuestionValue": 10,
    "currCorrectAnswer": "",
    "currAnswerOptions": [],
    "clientAnswers": {},
    "clientResults": {},
    "numClientsPlaying": 0,
    "usersInGame": {}
  }
  // Update room game state on successful create game
  rooms[roomCode].gameState = "join";
}

function quitGame(roomCode) {
  // Reset user isPlaying state
  resetUsersInGame(roomCode);
  // Delete game object
  delete games[roomCode];
  // Update room game state on successful quit game
  rooms[roomCode].gameState = "setup";
}

function joinGame(roomCode, clientId) {
  // Update client isPlaying
  clients[clientId].isPlaying = true;
  // Increment numClientsPlaying
  games[roomCode].numClientsPlaying = games[roomCode].numClientsPlaying + 1;
  // Update usersInGame value in game object. TODO: be more efficient. Don't overwrite every time.
  games[roomCode].usersInGame = getUsersInGame(roomCode);
}

function leaveGame(roomCode, clientId) {
  // Update client isPlaying
  clients[clientId].isPlaying = false;
  // Decrement numClientsPlaying
  games[roomCode].numClientsPlaying = games[roomCode].numClientsPlaying - 1;
  // Update usersInGame value in game object. TODO: be more efficient. Don't overwrite every time.
  games[roomCode].usersInGame = getUsersInGame(roomCode);
}

function startGameRound(roomCode) {
  // Update room state
  rooms[roomCode].gameState = "play";
  // Increment current question, reset client answers and results, reset timer
  incrementCurrQuestion(roomCode);
  // Start round timer
  startRoundTimer(roomCode);
}

// NOTE: clients should only be able to answer each question once
function play(roomCode, clientId, answer) {
  // Save client response
  games[roomCode].clientAnswers[clientId] = answer;
  // Grade, store result
  let isCorrect = (answer === games[roomCode].currCorrectAnswer);
  games[roomCode].clientResults[clientId] = isCorrect;
  if (isCorrect) {
    addToUserScore(roomCode, clientId, games[roomCode].currQuestionValue);
  }
  // If last person answers before time expires, go to results (?)
  if (Object.keys(games[roomCode].clientAnswers).length === games[roomCode].numClientsPlaying) {
    gameResultsHandler(roomCode);
  }
}

function kickUser(roomCode, kickedUsername) {
  let kickedClientId = rooms[roomCode].takenUsernames[kickedUsername];
  // Close client's connection
  clients[kickedClientId].connection.close();
  // Delete client reference in games. If user is playing, leave game.
  if (clients[kickedClientId].isPlaying) {
    leaveGame(roomCode, kickedClientId);
  }
  // Delete client reference in rooms.
  let roomIndex = rooms[roomCode].clients.indexOf(kickedClientId)
  rooms[roomCode].clients.splice(roomIndex,1);
  delete rooms[roomCode].takenUsernames[kickedUsername];
  // Delete client reference in clients.
  delete clients[kickedClientId];
}

/* ------------------------- GAME ACTION HELPERS ------------------------- */
// NOTE: Make sure to call this only once per round, ONLY by Host
function incrementCurrQuestion(roomCode) {
  let questionAmount = parseInt(games[roomCode].gameParams.gameQuestionNum);
  // Verify there is a next question
  if (games[roomCode].currQuestionNum < questionAmount-1) {
    // Increment question data
    games[roomCode].currQuestionNum = games[roomCode].currQuestionNum + 1;
    games[roomCode].currQuestion = getCurrentQuestion(roomCode);
    games[roomCode].currCorrectAnswer = getCurrentCorrectAnswer(roomCode);
    games[roomCode].currAnswerOptions = getCurrentAnswerOptionsRandomized(roomCode);
    // Reset client answer/result info

    // TODO: save for all rounds -> make "report cards"
    games[roomCode].clientAnswers = {};
    games[roomCode].clientResults = {};
    // Reset timer end time
    games[roomCode].currTimerEnd = Date.now() + games[roomCode].timerTime + 1000;
  }
}

function getCurrentGameData(roomCode) {
  // TODO: CAN BE SMARTER ABOUT. BE MORE EFFICIENT. ONLY RETURN WHAT IS NEEDED
  // DEPENDING ON CURR GAME STATE.
  // MAY WANT TO HAVE clientId PARAMETER AS WELL FOR ANSWER, RESULT ON RECONNECT IE BEFORE ROUND END.
  let gameData = {
    "currQuestionNum": games[roomCode].currQuestionNum,
    "currTimerEnd": games[roomCode].currTimerEnd,
    "currQuestion": games[roomCode].currQuestion,
    "currCorrectAnswer":games[roomCode].currCorrectAnswer,
    "currAnswerOptions": games[roomCode].currAnswerOptions,
    "gameParams": games[roomCode].gameParams,
    "clientAnswers": games[roomCode].clientAnswers,
    "clientResults": games[roomCode].clientResults,
    "numClientsPlaying": games[roomCode].numClientsPlaying,
    "usersInGame": games[roomCode].usersInGame
  }
  return gameData;
}

function getCurrentQuestion(roomCode) {
  let currQuestionNum = games[roomCode].currQuestionNum;
  return games[roomCode].gameQAData[currQuestionNum].question;
}

function getCurrentCorrectAnswer(roomCode) {
  let currQuestionNum = games[roomCode].currQuestionNum;
  return games[roomCode].gameQAData[currQuestionNum].correct_answer;
}

function getCurrentAnswerOptionsRandomized(roomCode) {
  let currQuestionNum = games[roomCode].currQuestionNum;
  let answerOptions = games[roomCode].gameQAData[currQuestionNum].incorrect_answers;
  answerOptions.push(games[roomCode].gameQAData[currQuestionNum].correct_answer);
  // Shuffle array (Fisher-Yates shuffle)
  let currIndex = answerOptions.length;
  let randIndex;
  while (currIndex > 0) {
    randIndex = Math.floor(Math.random() * currIndex);
    currIndex--;
    [answerOptions[currIndex], answerOptions[randIndex]] = [answerOptions[randIndex], answerOptions[currIndex]];
  }
  return answerOptions;
}

// Start timer at start of round, keep reference in case of reconnect
function startRoundTimer(roomCode) {
  // Verify that game exists and game state is in "play"
  if (rooms[roomCode].gameState !== "play" || !(roomCode in games)) {
    return;
  }
  // Keep track of time left to 0.1s
  let timeLeftMs = games[roomCode].currTimerEnd - Date.now();
  let timeLeftDs = Math.floor(timeLeftMs/100) / 10;
  timeLeftDs = Math.max(timeLeftDs, 0);
  // Update timekeeping every 0.1s (enough accuracy for timer sync)
  if (timeLeftDs > 0 && roomCode in games) {
    setTimeout(() => {
      startRoundTimer(roomCode);
    }, 100);
  }
  // If timer done AND game is not already in "results" state, show results
  else if (rooms[roomCode].gameState !== "results") {
    gameResultsHandler(roomCode);
  }
}

/* ------------------------- GET/SET CLIENT INFORMATION -------------------------  */

// Get map of client username to current score.
// Send after every new room join and game round to all clients, and after rejoin
// to reconnecting client.

// TODO: FIX
// NOTE/BUG: IF USERS HAVE SAME NAME USERNAME
function getUsersScores(roomCode) {
  let usersScores = [];
  rooms[roomCode].clients.forEach(clientId => {
    let username = clients[clientId].username;
    let score = clients[clientId].gameScore;
    usersScores.push({"username": username, "score": score});
  })
  return usersScores;
}

function addToUserScore(roomCode, clientId, points) {
  // TODO: verify clientId in this room
  clients[clientId].gameScore = clients[clientId].gameScore + points;
}

function resetUsersScores(roomCode) {
  rooms[roomCode].clients.forEach(clientId => {
    clients[clientId].gameScore = 0;
  })
}

function getUsersInGame(roomCode) {
  let usersInGame = [];
  rooms[roomCode].clients.forEach(clientId => {
    let username = clients[clientId].username;
    let isPlaying = clients[clientId].isPlaying;
    usersInGame.push({"username": username, "isPlaying": isPlaying});
  })
  return usersInGame;
}

function resetUsersInGame(roomCode) {
  rooms[roomCode].clients.forEach(clientId => {
    clients[clientId].isPlaying = false;
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


export { gameQADataHandler };
