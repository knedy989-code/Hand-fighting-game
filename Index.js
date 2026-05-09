const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

let queue = [];

// --- THE GAME UI (HTML) ---
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Hand Fighter Online</title>
    <script src="/socket.io/socket.io.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
    <style>
        body { margin: 0; background: #000; color: #0f8; font-family: sans-serif; overflow: hidden; }
        #status { position: absolute; top: 50%; width: 100%; text-align: center; font-size: 2em; }
        #hp-container { position: absolute; top: 20px; width: 100%; display: none; justify-content: space-around; }
        .bar { width: 40%; height: 20px; border: 2px solid #fff; }
        #my-hp { background: #0f8; width: 100%; height: 100%; transition: 0.2s; }
        #enemy-hp { background: #f30; width: 100%; height: 100%; transition: 0.2s; }
        canvas { width: 100vw; height: 100vh; object-fit: cover; }
    </style>
</head>
<body>
    <div id="status">CONNECTING TO QUEUE...</div>
    <div id="hp-container">
        <div class="bar"><div id="my-hp"></div></div>
        <div class="bar"><div id="enemy-hp"></div></div>
    </div>
    <video id="input_video" style="display:none" playsinline></video>
    <canvas id="output_canvas"></canvas>

    <script type="module">
        const socket = io();
        let roomId = null, myHP = 100, enemyPos = {x:0, y:0};
        const status = document.getElementById('status');

        socket.on('matchFound', data => {
            roomId = data.room;
            status.style.display = 'none';
            document.getElementById('hp-container').style.display = 'flex';
        });

        socket.on('enemyMove', pos => enemyPos = pos);
        socket.on('tookDamage', () => {
            myHP -= 5;
            document.getElementById('my-hp').style.width = myHP + "%";
            if(myHP <= 0) { alert("KO!"); location.reload(); }
        });

        const canvas = document.getElementById('output_canvas');
        const ctx = canvas.getContext('2d');
        const hands = new Hands({locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/hands/\${file}\`});
        
        hands.onResults(results => {
            ctx.save();
            ctx.clearRect(0,0,canvas.width, canvas.height);
            ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
            ctx.globalAlpha = 0.5;
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;

            if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
                const wrist = results.multiHandLandmarks[0][0];
                const myPos = {x: (1-wrist.x)*canvas.width, y: wrist.y*canvas.height};
                if(roomId) {
                    socket.emit('move', {room: roomId, pos: myPos});
                    if(Math.sqrt((myPos.x-enemyPos.x)**2 + (myPos.y-enemyPos.y)**2) < 70) {
                        socket.emit('attack', {room: roomId});
                    }
                }
                ctx.fillStyle = '#0f8'; ctx.beginPath(); ctx.arc(myPos.x, myPos.y, 20, 0, Math.PI*2); ctx.fill();
            }
            if(roomId) {
                ctx.fillStyle = '#f30'; ctx.beginPath(); ctx.arc(enemyPos.x, enemyPos.y, 20, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();
        });

        const camera = new Camera(document.getElementById('input_video'), {
            onFrame: async () => { await hands.send({image: document.getElementById('input_video')}); },
            width: 640, height: 480
        });
        camera.start().then(() => socket.emit('joinQueue'));
    </script>
</body>
</html>
\`;

// --- THE SERVER BRAIN (Node.js) ---
app.get('/', (req, res) => res.send(htmlContent));

io.on('connection', (socket) => {
    socket.on('joinQueue', () => {
        queue.push(socket);
        if (queue.length >= 2) {
            const p1 = queue.shift();
            const p2 = queue.shift();
            const room = "room_" + p1.id;
            p1.join(room); p2.join(room);
            io.to(room).emit('matchFound', { room });
        }
    });

    socket.on('move', (data) => socket.to(data.room).emit('enemyMove', data.pos));
    socket.on('attack', (data) => socket.to(data.room).emit('tookDamage'));
    socket.on('disconnect', () => { queue = queue.filter(s => s.id !== socket.id); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log('Server online!'));
