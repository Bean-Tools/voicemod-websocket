import { exit, env } from 'process';
import { Soundboard, Voice } from '../src/types';
import VoicemodWebsocket from '../src/websocket';

let config;
let config_file: string;

if (env.NODE_ENV === 'production') {
  console.warn("You're not running in development mode");
  console.warn('Please create a config.ts file in the test directory, see config.ts.example');
  exit(1);
} else {
  config_file = './config.ts';
}

import(config_file)
  .then((c) => {
    if (!c.config) {
      console.error('Please create a config.ts file in the test directory, see config.ts.example');
      exit(1);
    }

    config = c.config;

    const voicemod = new VoicemodWebsocket('127.0.0.1', config.client_key, true, 500, 50);

    // This one logs *everything* that comes from the websocket
    // Usefull to see what's going on e.g. if something isn't working
    // Or something in Voicemod's API documentation was off
    voicemod.on('AllEvents', (...args) => {
      console.debug(
        'VM.on(AllEvents):::         ',
        args[0].actionType ? args[0].actionType : args[0],
      );
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

    voicemod.on('VoiceChanged', (voice: Voice) => {
      console.log('VM.on(VoiceChanged):::      ', voice.friendlyName || voice.id);
    });

    voicemod.on('VoiceChangerStatusChanged', (status) => {
      console.log('VM.on(VoiceChangerStatusChanged)::: ', status);
    });

    voicemod.on('ClientRegistered', async () => {
      let status = voicemod.getBadLanguageStatus();
      console.log('Bad language status', status);

      voicemod.on('BadLanguageStatusChanged', (status) => {
        console.log('VM.on(BadLanguageStatusChanged)::: ', status);
      });

      voicemod.setBeepSound(true);

      status = voicemod.getBadLanguageStatus();
      console.log('Bad language status', status);

      setTimeout(() => {
        voicemod.setBeepSound(false);
      }, 200);

      voicemod.playMeme('38e80aaa-b4cd-40f5-be9d-32dbaa7ff23c');

      setTimeout(() => {
        voicemod.stopMemes();
        voicemod.disconnect();
        exit(0);
      }, 2000);

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

        voicemod.getAllSoundboard().then((profiles: Soundboard[]) => {
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

    voicemod.on('ConnectionRetry', () => {
      console.log('VM.on(ConnectionRetry)');
    });

    voicemod
      .connect()
      .then(() => {
        console.log('Connected');
      })
      .catch((err) => {
        console.error('Error connecting', err);
      });
  })
  .catch((err) => {
    console.error('Could not load config.ts');

    console.error(err);
    exit(1);
  });
