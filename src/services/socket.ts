import { Server } from "socket.io";
import { Redis } from "ioredis";
import dotenv  from "dotenv"

dotenv.config()


// Initialize Redis instances
   const pub = new Redis(process.env.REDIS_URL!);
   const sub = new Redis(process.env.REDIS_URL!);
// Define available rooms
const rooms = ["ADHD", "OCD", "DEPRESSION", "ANXIETY"];

class socketService {
    private _io: Server;
    private userRooms: Map<string, string> = new Map();
    private userColors: Map<string, string> = new Map();  // Map to store user colors

    constructor() {
        console.log('Init Socket Server');
        this._io = new Server({
            cors: {
                allowedHeaders: ['*'],
                origin: '*'
            }
        });

        sub.on('message', (channel, message) => {
            console.log(message);
            if (rooms.includes(channel)) {
                this._io.to(channel).emit('message', JSON.parse(message));
            }
        });
    }

    get io() {
        return this._io;
    }

    // Generate a random RGB color
    private generateRandomColor(): string {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        return `rgb(${r},${g},${b})`;
    }

    public initListeners() {
        const io = this._io;
        io.on('connect', (socket) => {
            console.log('New Socket connected');
            console.log('Initialized socket listeners');

            // Assign a random color to the connected client
            const userColor = this.generateRandomColor();
            this.userColors.set(socket.id, userColor);
            socket.on('joinRoom', ({ room }) => {
                if (rooms.includes(room)) {
                    const currentRoom = this.userRooms.get(socket.id);
                    if (currentRoom) {
                        socket.leave(currentRoom);
                        console.log(`Socket left room: ${currentRoom}`);
                    }
                    socket.join(room);
                    this.userRooms.set(socket.id, room);
                    console.log(`Socket joined room: ${room}`);

                    // Subscribe to the room if not already subscribed
                    sub.subscribe(room);
                    console.log(`Subscribed to Redis channel: ${room}`);
                } else {
                    console.log(`Invalid room: ${room}`);
                }
            });

            socket.on('leaveRoom', () => {
                const currentRoom = this.userRooms.get(socket.id);
                if (currentRoom) {
                    socket.leave(currentRoom);
                    this.userRooms.delete(socket.id);
                    console.log(`Socket left room: ${currentRoom}`);

                    // Unsubscribe from the room if no sockets are in the room
                    if (this._io.sockets.adapter.rooms.get(currentRoom)?.size === 0) {
                        sub.unsubscribe(currentRoom);
                        console.log(`Unsubscribed from Redis channel: ${currentRoom}`);
                    }
                }
            });

            socket.on('event:message', async ({ message }) => {
                const room = this.userRooms.get(socket.id);
                const color = this.userColors.get(socket.id);
                if (room && color) {
                    console.log(`New message received in room ${room}: ${message}`);
                    await pub.publish(room, JSON.stringify({ room, message, color }));
                } else {
                    console.log(`User is not in any room`);
                }
            });

            socket.on('disconnect', () => {
                const currentRoom = this.userRooms.get(socket.id);
                if (currentRoom) {
                    socket.leave(currentRoom);
                    this.userRooms.delete(socket.id);
                    this.userColors.delete(socket.id);
                    console.log(`Socket disconnected and left room: ${currentRoom}`);

                    // Unsubscribe from the room if no sockets are in the room
                    if (this._io.sockets.adapter.rooms.get(currentRoom)?.size === 0) {
                        sub.unsubscribe(currentRoom);
                        console.log(`Unsubscribed from Redis channel: ${currentRoom}`);
                    }
                }
            });
        });
    }
}

export default socketService;
