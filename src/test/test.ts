import { exit } from 'process';
import { VoicemodSoundboard, VoicemodVoice } from '../types';
import VoicemodWebsocket from '../websocket';

import { config } from './config';

const voicemod = new VoicemodWebsocket('127.0.0.1', config.client_key);

// This one logs *everything* that comes from the websocket
// Usefull to see what's going on e.g. if something isn't working
// Or something in Voicemod's API documentation was off
voicemod.on('AllEvents', (...args) => {
    console.debug('VM.on(AllEvents):::         ', args[0].actionType ? args[0].actionType : args[0]);
});


voicemod.on('ClientRegistrationFailed', () => {
    console.log('VM.on(ClientRegistrationFailed)');
    exit(1);
});

voicemod.on('UserChanged', (user) => {
    console.log('VM.on(UserChanged):::       ', user);
});

voicemod.on('UserLicenseChanged', (license) => {
    console.log('VM.on(UserLicenseChanged):: ', license);
});

voicemod.on('VoiceChanged', (voice: VoicemodVoice) => {
    console.log('VM.on(VoiceChanged):::      ', voice.friendlyName || voice.id);
});

voicemod.on('VoiceChangerStatusChanged', (status) => {
    console.log('VM.on(VoiceChangerStatusChanged)::: ', status);
});

voicemod.on('ClientRegistered', () => {
  voicemod.getVoices().then((voices) => {
    console.log(`Found ${voices.length} voices`);

    voicemod.getUserLicense().then((license) => {
      console.log('License', license);
    });

    voicemod.getUser().then((user) => {
      console.log('User', user);
    });

    voicemod.getActiveSoundboardProfile().then((profile) => {
      console.log('Active soundboard profile', profile.name);
    });

    voicemod.getAllSoundboard().then((profiles: VoicemodSoundboard[]) => {
      console.log('Number of Soundboard profiles', profiles.length);
    });

    voicemod.getBackgroundEffectsStatus().then((status) => {
      console.log('Background effects status', status);
    });

    voicemod.getVoiceChangerStatus().then((status) => {
      console.log('Voice changer status', status);
    });

    voicemod.getCurrentVoice().then((voice) => {
      console.log('Current voice', voice.friendlyName);

      const random_voice = voices[Math.floor(Math.random() * voices.length)];
      console.log('Setting voice to', random_voice.friendlyName);
      voicemod.setVoice(random_voice.id);
    });

    voicemod.getMuteMicStatus().then((mute) => {
      console.log('Mute status', mute);
    });

    voicemod.getCurrentVoice().then((voice) => {
      console.log('Current voice', voice.friendlyName);

      // Comment this out if you want to test listening to events instead of
      // closing the connection at the end of the script
      //voicemod.disconnect();
    });
  });
});

voicemod.connect().then(() => {
  console.log('Connected');
}).catch((err) => {
  console.error('Error connecting', err);
});
