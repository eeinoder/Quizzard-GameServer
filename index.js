// Web Socket Server

import { requestNewTriviaGame } from "./triviaAPI.js";
import http from "http";
import fs from "fs";
import websocket from "websocket";

// TODO: create https server -> secure websockets
/*const options = {
  key: fs.readFileSync('test/fixtures/keys/agent2-key.pem'),
  cert: fs.readFileSync('test/fixtures/keys/agent2-cert.pem'),
};*/

const websocketServer = websocket.server;
const httpServer = http.createServer();
httpServer.listen(9090, () => console.log("Listening... on 9090"));


//hashmap clients
const rooms = {}; // NOTE: 'rooms' previously 'games'
const clients = {}; //  Stores client connections (TODO: also, scores, and username(?))
// TODO: have to think about this carefully, how to manage multiple
// rooms.
// Make objects for client, room, etc.: specify attributes, e.g. username for client
const maxClients = 12;

const wsServer = new websocketServer({
    "httpServer": httpServer
});

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
        // TODO: Add error code if create room fails, sever connection
        if (result.method === "createRoom") {
          const hostId = result.clientId;
          const roomCode = uniqueRoomCode();
          console.log(roomCode)
          rooms[roomCode] = {
            "roomCode": roomCode,
            "hostId": hostId,
            "clients": [hostId]
          }
          // Send back roomCode
          const payLoad = {
            "method": "createRoom",
            "roomCode": roomCode
          }
          clients[hostId].connection.send(JSON.stringify(payLoad));
        }

        // JOIN ROOM METHOD
        if (result.method === "joinRoom") {
          const clientId = result.clientId;
          const clientUsername = result.clientUsername;
          const roomCode = result.roomCode;
          // If room found, update paramters and relevant globals
          if (roomCode in rooms) {
            clients[clientId].username = clientUsername;
            rooms[roomCode].clients.push(clientId);
            const payLoad = {
              "method": "joinRoom",
              "joinedClientId": clientId,
              "joinedClientUsername": clientUsername,
              "joinedUsernamesList": [],
              "errMsg": ""
            }
            // TODO: SEND LIST OF ALL USERNAMES ON ANY CLIENT JOIN, AND ON RECONNECTS
            rooms[roomCode].clients.forEach(clientId => {
              clients[clientId].connection.send(JSON.stringify(payLoad));
            })
          }
          else {
            const payLoad = {
              "method": "joinRoom",
              "joinedClientId": "",
              "joinedClientUsername": "",
              "joinedUsernamesList": [],
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
        // TODO/FIX: BUG ON RECONNECT WHERE

        // RECONNECT TO ROOM
        if (result.method === "reconnect") { 
          const originalClientId = result.originalClientId;
          const tempClientId = result.tempClientId;
          const roomCode = result.roomCode;
          // Verify clientId<->room mapping exists, i.e. prev. client trying to reconnect
          let recipientClientId = tempClientId;
          // Send back response
          // TODO: SEND BACK OTHER CLIENT DATA TO RELOAD STATS ??
          const payLoad = {
            "method": "reconnect",
            "recipientClientId": recipientClientId,
            "errMsg": "Failed to reconnect"
          }
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
            clients[originalClientId] = clients[tempClientId];
            delete clients[tempClientId];
            recipientClientId = originalClientId;
            payLoad.recipientClientId = recipientClientId;
          }
          clients[recipientClientId].connection.send(JSON.stringify(payLoad));
        }

        // SEND ANSWER METHOD
        if (result.method === "play") {

        }

        // SEND CHAT MESSAGE METHOD
        // TODO: VERIFY USER IS IN THIS ROOM?
        if (result.method === "chat") {
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

    })
    connectClientResponse(connection);
    // TODO: DELETE BELOW, TESTING WITH FORCED DISCONNECT
    /*setTimeout(() => {
      connection.close();
    }, 2000);*/
})



/* -------------------------- WS REQ/RES HANDLERS -------------------------- */

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

  // FIX: above doesn't look right. makes a client guid on EVERY request??
  // Testing
  var size = Object.keys(clients).length;
  console.log("Clients size: ", size);
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
