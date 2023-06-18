# voicemod-websocket

TypeScript Websocket Class for Voicemod's Control API.

## Quickstart

You will need an API key and a running Voicemod.

To create a connection, run:

```js
const voicemod = new VoicemodWebSocket();
voicemod.connect("localhost", "aaaaaa-123456");

// Your logic and listeners go here

voicemod.disconnect();
```

## Events

You can find Events you can listen on in the Control API documentation.

They are mapped to the `EventTypes` type.

You can listen to events with the `on()` method, i.e.: 

```js
voicemod.on("VoiceChanged", (voice) => {
  console.log("Voice changed to", voice.friendlyName);
});
```
