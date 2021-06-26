const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const validatePassword = (password) => {
  return password.length > 6;
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, password, name, gender)
     VALUES
      (
       '${username}',
       '${hashedPassword}',
       '${name}',
       '${gender}'
      );`;
    if (validatePassword(password)) {
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
   SELECT
      username,
      tweet,
      date_time
    FROM
      user INNER JOIN tweet ON user.user_id = tweet.user_id
    ORDER BY
      date_time DESC
    LIMIT 4;`;
  const tweetsArray = await database.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
   SELECT
    name
   FROM
    user INNER JOIN follower ON user.user_id = follower.following_user_id;`;
  const tweetsArray = await database.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
   SELECT
    name
   FROM
    user INNER JOIN follower ON user.user_id = follower.follower_user_id;`;
  const tweetsArray = await database.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetStatsQuery = `
    SELECT
      tweet,
      SUM(like_id),
      SUM(reply_id),
      tweet.date_time
    FROM
      user INNER JOIN tweet ON user.user_id = tweet.user_id 
      INNER JOIN reply ON user.user_id = reply.user_id 
      INNER JOIN like ON user.user_id = like.user_id 
    WHERE
      tweet_id=${tweetId};`;
  const tweets = await database.get(getTweetStatsQuery);
  response.send({
    tweet: tweets["tweet"],
    likes: tweets["SUM(like_id)"],
    replies: tweets["SUM(reply_id)"],
    dateTime: tweets["date_time"],
  });
});
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const postTweetQuery = `
  INSERT INTO
    tweet (tweet)
  VALUES
      (
       '${tweet}'
      );`;
  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const deleteTodoQuery = `
    DELETE FROM
      tweet
    WHERE
      tweet_id = ${tweetId};
    `;
    const dbUser = await database.run(deleteTodoQuery);
    if (dbUser === undefined) {
      response.status(400);
      response.send("Invalid Request");
    } else {
      await database.run(deleteTodoQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
