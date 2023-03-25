import WebSocket from 'ws';

export class WebSocketSender {
    private static subscriptions: Map<string, WebSocketSender[]> = new Map();

    private constructor(readonly topic: string, readonly websocket: WebSocket) {}

    static send(topic: string, message: string | object) {
        const subscribers = WebSocketSender.subscriptions.get(topic);
        if (subscribers) {
            const msg = typeof message === 'string' ? message : JSON.stringify(message);
            for (const subscriber of subscribers) {
                subscriber.websocket.send(msg);
            }
        }
    }

    static subscribe(topic: string, websocket: WebSocket) {
        WebSocketSender.unsubscribe(websocket);
        let subscribers = WebSocketSender.subscriptions.get(topic);
        if (!subscribers) {
            subscribers = [];
            WebSocketSender.subscriptions.set(topic, subscribers);
        }
        subscribers.push(new WebSocketSender(topic, websocket));
    }

    static unsubscribe(websocket?: WebSocket) {
        if (websocket) {
            const subscribers: WebSocketSender[] = [];
            for (const topic of WebSocketSender.subscriptions.keys()) {
                for (const subscriber of WebSocketSender.subscriptions.get(topic) || []) {
                    if (subscriber.websocket === websocket) {
                        subscribers.push(subscriber);
                    }
                }
            }
            subscribers.forEach((subscriber) => {
                WebSocketSender.subscriptions.delete(subscriber.topic);
            });
        } else {
            // unsubscribe all
            WebSocketSender.subscriptions.clear();
        }
    }
}
