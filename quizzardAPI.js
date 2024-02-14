// quizzardAPI.js


// Important parameters:
// room: roomId
//    room[clientId] = client_connection
// client: clientId
// host: clientId (only one host)
// gameData {questions, answers, client responses?}
//    (record of responses maybe not necessary for multiple choice?)
//    (don't need Id cause only one per room? just gameRunning flag? True/False)
//    game[client] = {} , i.e. not all room clients might have joined game
// scores: scores[clientId]


//    *game state* (what to keep track, what to serve clients)
/*
      Current question (store, serve to all playing)
      Clients' responses (store(? or just use to calc. score))
      Clients' current score (store, calculate, serve to all)

*/


// NOTE: in "party" mode, Host not playing by default, can connect device to TV
// Can choose to play before game start but answers will be visible so advised to not connect to TV

//    *game loop*
/*    (host created room, clients in room)
      Host: createGame -> Server: readyGame (after getting trivia data, etc.)
      Client: joinGame -> Server: joinedGame (clientId in game object, looped over to serve question data and results during game)
          (TODO: how to re-establish connection if severed?)
      Host: startGame -> Server: startedGame (update flag?, FE event -> IN THE GAME)
          ALL PLAYERS: Always send question data
      Client: sendAnswer -> Server: sendScoreUpdate (send immediately, but FE revealed after question timer?)
          For host: If not playing, disable FE submit button, no score update or score+=0 update by default
      ... continue until all questions exhausted ...
      Server: sendFinalScores
*/

// TODO: Question timing - how does latency affect this?
// Once server spins up it's good?
// Timers should take place on server side?


/*
METHODS:
(how will clients interact with WS game server)

createRoom
  create a roomId, 4-letter room code, store in set (map?) of occupied rooms
  so no duplicate code is made

joinRoom


sendChat

createGame (only Host, one game at a time)

joinGame (response is initial/current Game state)
- components of game state, e.g. "jackbox" trivia (one at a time from bank)
  -

startGame (only Host, manually start once all players in game)

sendAnswer (?)
*/
