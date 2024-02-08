// Web Socket Server

import { requestNewTriviaGame } from "./triviaAPI.js";
import http from "http";
import websocket from "websocket";

//const app = require("express")();
//app.get("/", (req,res)=> res.sendFile(__dirname + "/index.html"))
//app.listen(9091, ()=>console.log("Listening on http port 9091"))

const websocketServer = websocket.server;
const httpServer = http.createServer();
httpServer.listen(9090, () => console.log("Listening... on 9090"));

//hashmap clients
const rooms = {}; // NOTE: 'rooms' previously 'games'
const clients = {};
// TODO: have to think about this carefully, how to manage multiple
// rooms.
// Make objects for client, room, etc.: specify attributes, e.g. username for client

const wsServer = new websocketServer({
    "httpServer": httpServer
});

requestTriviaGame("General Knowledge", "something", 50);

function doSomething(triviaData) {
  console.log(triviaData);
}

/*
wsServer.on("request", request => {
    //connect
    const connection = request.accept(null, request.origin);
    connection.on("open", () => console.log("opened!"))
    connection.on("close", () => console.log("closed!"))
    connection.on("message", message => {
        const result = JSON.parse(message.utf8Data)
        //I have received a message from the client
        //a user want to create a new game
        if (result.method === "create") {
            const clientId = result.clientId;
            const gameId = guid();
            games[gameId] = {
                "id": gameId,
                "balls": 20,
                "clients": []
            }

            const payLoad = {
                "method": "create",
                "game" : games[gameId]
            }

            const con = clients[clientId].connection;
            con.send(JSON.stringify(payLoad));
        }

        //a client want to join
        if (result.method === "join") {

            const clientId = result.clientId;
            const gameId = result.gameId;
            const game = games[gameId];
            if (game.clients.length >= 3)
            {
                //sorry max players reach
                return;
            }
            const color =  {"0": "Red", "1": "Green", "2": "Blue"}[game.clients.length]
            game.clients.push({
                "clientId": clientId,
                "color": color
            })
            //start the game
            if (game.clients.length === 3) updateGameState();

            const payLoad = {
                "method": "join",
                "game": game
            }
            //loop through all clients and tell them that people has joined
            game.clients.forEach(c => {
                clients[c.clientId].connection.send(JSON.stringify(payLoad))
            })
        }
        //a user plays
        if (result.method === "play") {
            const gameId = result.gameId;
            const ballId = result.ballId;
            const color = result.color;
            let state = games[gameId].state;
            if (!state)
                state = {}

            state[ballId] = color;
            games[gameId].state = state;

        }

    })

    //generate a new clientId
    const clientId = guid();
    clients[clientId] = {
        "connection":  connection
    }

    const payLoad = {
        "method": "connect",
        "clientId": clientId
    }
    //send back the client connect
    connection.send(JSON.stringify(payLoad))

})*/


// Create guid unique identifier
function S4() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
}
// then to call it, plus stitch in '4' in the third group
const guid = () => {
  (S4() + S4() + "-" + S4() + "-4" + S4().substr(0,3) + "-" + S4() + "-" + S4() + S4() + S4()).toLowerCase()};


export { doSomething };
