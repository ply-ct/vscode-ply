import * as WebSocket from 'ws';

export class WebSocketSender {

    private static subscriptions: Map<string,WebSocketSender[]> = new Map();

    static send(topic: string, message: string) {
        const subscribers = WebSocketSender.subscriptions.get(topic);
        if (subscribers) {
            for (const subscriber of subscribers) {
                subscriber.websocket.send(message);
            }
        }
    }

    constructor(private websocket: WebSocket) { }

    subscribe(topic: string) {
        this.unsubscribe(topic);
        let subscribers = WebSocketSender.subscriptions.get(topic);
        if (!subscribers) {
            subscribers = [];
            WebSocketSender.subscriptions.set(topic, subscribers);
        }
        subscribers.push(this);
    }

    unsubscribe(topic?: string) {
        if (topic) {
            const subscribers = WebSocketSender.subscriptions.get(topic);
            if (subscribers) {
                const idx = subscribers.indexOf(this);
                if (idx >= 0) {
                    subscribers.splice(idx, 1);
                    if (subscribers.length === 0) {
                        WebSocketSender.subscriptions.delete(topic);
                    }
                }
            }
        } else {
            // unsubscribe all
            for (const topic of WebSocketSender.subscriptions.keys()) {
                this.unsubscribe(topic);
            }
        }
    }
}

