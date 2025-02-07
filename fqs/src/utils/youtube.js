// This module provides a simple interface to the YouTube IFrame API
// for playing only the audio portion of a YouTube video. The order of
// operations is as follows:
// 1. In a load event listener, call initYouTubeAPI() to initialize the YouTube
//    IFrame API.
// 2. initYouTubeAPI() injects the YouTube IFrame API script
// 3. When that script loads, it calls our global onYouTubeIframeAPIReady()
// 4. onYouTubeIframeAPIReady() creates the player instance
// 5. The player becomes available globally via window.player
// 6. Your code can now call player.loadVideoById() to load a video and
//    use player.playYouTubeAt() to play it at a specific time and rate.
// -------------------------------------------------------------------

// The following need to be available at global scope 
// for the YouTube IFrame API to work.
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
window.player = null;

// YouTube IFrame API initialization. Call this export function once the page loads.
export function initYouTubeAPI() {
  console.log('Initializing YouTube API...');
  let tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onload = () => {
    console.log('YouTube IFrame API script loaded');
  };
  let firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Minimal player initialization. This implementation avoids third-party cookie issues.
// See https://stackoverflow.com/a/64444601/426853
export function onYouTubeIframeAPIReady() {
  console.log('Creating YouTube player...');
  window.player = new YT.Player('player', {
    height: '0',
    width: '0',
    videoId: '',
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      'playsinline': 1,
      origin: window.location.host
    },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
  console.log('Player created');
}
// Handle player state changes
export function onPlayerStateChange(event) {
  const speakerIcons = document.querySelectorAll('.speaker-icon');
  const TIME_TOLERANCE = 0.5; // Half second tolerance

  if (event.data === YT.PlayerState.PLAYING) {
    const currentTime = player.getCurrentTime();
    // Add active class to current speaker icon
    speakerIcons.forEach(icon => {
      const iconTime = parseFloat(icon.dataset.timestamp);
      if (Math.abs(currentTime - iconTime) < TIME_TOLERANCE) {
        icon.classList.add('speaker-icon-active');
      }
    });
  } else if (event.data === YT.PlayerState.ENDED ||
    event.data === YT.PlayerState.PAUSED ||
    event.data === YT.PlayerState.STOPPED) {
    // Remove active class from all speaker icons
    speakerIcons.forEach(icon => {
      icon.classList.remove('speaker-icon-active');
    });
  }
}

export function playYouTubeAt(videoId, timeSeconds, rate = 1.0) {
  // Wait for player to be ready
  if (!player || !player.playVideo) {
    setTimeout(() => playYouTubeAt(videoId, timeSeconds, rate), 100);
    return;
  }
  if (player.getPlayerState() === YT.PlayerState.PLAYING) {
    player.pauseVideo();
    return;
  }
  if (player.getVideoData().video_id !== videoId) {
    player.loadVideoById(videoId, timeSeconds);
  } else {
    player.seekTo(timeSeconds);
  }
  try {
    player.setPlaybackRate(rate);
  } catch (e) {
    alert("Can't play this video at that rate. Check the  video to see what rates are supported.");
    console.log(e);
    return;
  }
  console.log("Playing " + videoId + " from " + timeSeconds + " seconds at " + rate + "x");
  player.playVideo()
}

