// triviaAPI.js
// Middleware to fetch trivia data from opentdb.com


// NOTE: For now, defaulting to requests with 50 multiple choice questions.
// Host then has choice of CATEGORY and DIFFICULTY.

import fetch from "node-fetch";
import { gameQADataHandler } from "./index.js"


// Base fetch url
const triviaBaseURL = "https://opentdb.com";
// Session Token
let token = ""; // set on first request
// Category and Difficulty options
const categories = {"General Knowledge":"9", "Film":"11", "Music":"12", "TV":"14",
"Art":"25", "Video Games":"15", "Science":"17", "Mythology":"20", "Sports":"21",
"Geography":"22", "History":"23", "Celebrities":"26"};
const difficulties = ["easy", "medium", "hard", ""];
// Set default request parameters
const typeQuestions = "multiple";


// GET TRIVIA DATA FROM OPEN_TDB
async function requestNewTriviaGame(gameParams, roomCode, gameSessionToken) {
  // Define defaults
  let type = typeQuestions;

  // Parse specified parameters
  let [category, amount, difficulty] = [gameParams.gameTitle, gameParams.gameQuestionNum, gameParams.gameDifficulty];
  difficulty = difficulty.toLowerCase();
  if (difficulty === "any") {
    difficulty = "";
  }
  let categoryCode = categories[category];
  let token = gameSessionToken;

  // Make new token if necessary
  if (!token) {
    let tokenPayload = await requestSessionTokenHelper();
    // Parse token payload (OpenTDB requet for new game session token)
    let newToken = tokenPayload.tokenJSON.token;
    let errResCode = tokenPayload.tokenJSON.response_code;
    let error = tokenPayload.error;
    // If nonzero response code
    if (error || errResCode !== 0) {
      // TODO: return if error ? test this
      let emptyJSON = {};
      gameQADataHandler(emptyJSON, gameParams, roomCode, "", error);
      return;
    }
    else {
      token = newToken;
    }
  }

  // Fetch trivia questions
  if (!(category in categories) || !(difficulties.includes(difficulty))) {
    let emptyJSON = {};
    let error = "Invalid category and/or difficulty parameters given.";
    gameQADataHandler(emptyJSON, gameParams, roomCode, "", error);
  }
  else {
    // Build request url
    let url = `${triviaBaseURL}/api.php?amount=${amount}&category=${categoryCode}&difficulty=${difficulty}&type=${type}&token=${token}`
    try {
      const response = await fetch(url);
      const rawGameDataJSON = await response.json();
      gameQADataHandler(rawGameDataJSON, gameParams, roomCode, token); // TODO: handle OpenTDB error reponse codes (0-6, listed below)
    } catch (error) {
      let emptyJSON = {};
      gameQADataHandler(emptyJSON, gameParams, roomCode, "", error);
    }
  }
}

// GET SESSION TOKEN FROM OPEN_TDB
async function requestSessionTokenHelper() {
  let tokenPayload = {
    "tokenJSON": {},
    "error": ""
  }
  try {
    const response = await fetch("https://opentdb.com/api_token.php?command=request");
    const tokenJSON = await response.json();
    tokenPayload.tokenJSON = tokenJSON;
    return tokenPayload; // TODO: handle OpenTDB error reponse codes (0-6, listed below)
  } catch (error) {
    //tokenPayload.error = error;
    tokenPayload.error = "Failed to get game session token. Trivia API Server may be down.";
  }
  return tokenPayload;
}

// Export from module
export { requestNewTriviaGame };



/* -------------------- OPENTDB TRIVIA API DESCRIPTION ---------------------- */

// ex. QA request:
// https://opentdb.com/api.php?amount=50&category=9&difficulty=medium
// https://opentdb.com/api.php?amount=10&category=11&difficulty=easy&type=boolean
// Must only specify amount. Params default to "any" category, difficulty, type (multiple or boolean)
// CATEGORY CODES (9-32)
/*
9 - General Knowledge
11 - Entertainment: Film
*/

// Session tokens -- prevent duplicate questions b/w requests, expire after 6hr inactivity
// Retrieve token:
// https://opentdb.com/api_token.php?command=request
// Use token:
// https://opentdb.com/api.php?amount=10&token=YOURTOKENHERE (i.e. add at end of request url)
// Reset token (use if no more unseen trivia questions, i.e. CODE 1)

// RESPONSE CODES
/*
Code 0: Success Returned results successfully.
Code 1: No Results Could not return results. The API doesn't have enough questions for your query. (Ex. Asking for 50 Questions in a Category that only has 20.)
Code 2: Invalid Parameter Contains an invalid parameter. Arguements passed in aren't valid. (Ex. Amount = Five)
Code 3: Token Not Found Session Token does not exist.
Code 4: Token Empty Session Token has returned all possible questions for the specified query. Resetting the Token is necessary.
Code 5: Rate Limit Too many requests have occurred. Each IP can only access the API once every 5 seconds.
*/

// NOTE: add requestDelay flag with 5s timer to limit API requests
// Can add request queue (?) saving requests while timer(s) elapse

/* */
