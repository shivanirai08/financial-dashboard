import "react-native-gesture-handler";
import "react-native-url-polyfill/auto";
import { registerRootComponent } from "expo";
import TrackPlayer from "react-native-track-player";

import App from "./App";
import { playbackService } from "./src/lib/playback-service";

TrackPlayer.registerPlaybackService(() => playbackService);

registerRootComponent(App);
