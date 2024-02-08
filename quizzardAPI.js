// quizzardAPI.js


// Important parameters:
// room: roomId
//    room[clientId] = client_connection
// client: clientId
// game: {questions, answers, client responses?}
//    (record of responses maybe not necessary for multiple choice?)
//    (don't need Id cause only one per room?)


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
