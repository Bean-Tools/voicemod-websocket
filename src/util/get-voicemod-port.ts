import { WebSocket } from 'ws';

/**
 * List of possible ports to connect to. These are necessary
 * because the Voicemod API does not have one single, fixed
 * port, but rather a range of ports where one *might* be open.
 *
 * Yeah. That look on your face? That's the same look I had.
 */
const possibleVoiceModPorts : number[] = [
    59129, 20000, 39273, 42152, 43782, 46667, 35679, 37170, 38501, 33952, 30546
];

export default async (host: string) : Promise<number> => {
    for (const port of possibleVoiceModPorts) {
        const isValidPort = await new Promise<boolean>((resolve) => {
        const ws = new WebSocket(`ws://${host}:${port}/v1`);

        ws.onopen = () => {
            ws.onopen = ws.onclose = ws.onerror = null;
            ws.close();
            resolve(true);
        };
        ws.onclose = () => {
            ws.onopen = ws.onclose = ws.onerror = null;
            resolve(false);
        };

        ws.onerror = () => {
            ws.onopen = ws.onclose = ws.onerror = null;
            resolve(false);
        };
        });

        if (isValidPort === true) {
            return port;
        }
    }

    throw new Error('unable to find valid Voicemod port');
};