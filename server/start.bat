@echo off
cd /d %~dp0

echo Installing dependencies...
call npm install nodemon ejs express express-session sequelize multer mysql2 cors

echo Opening browser...
start http://localhost:3001

echo Starting server...
npm start