// The interface around the world: the radar, weather menu, corner switches,
// Dock, the F prompt, the touch flight pad, the phone, the big map, the page
// card and the notice shown if 3D cannot start. main.js mounts it before
// anything else, so a site's index.html holds only its own content
// (<section id="pages">) and a loading bar.
// BetterMapIt, the map app by Homecraft's author, credited in every radar.
const BETTERMAPIT = new URL('./assets/bettermapit.webp', import.meta.url).href;
const HUD = `
<div id="hud" hidden>
  <div id="minimap">
    <canvas width="220" height="220" aria-label="小地图，点一下就走过去" data-en-label="Minimap: tap to walk there"></canvas>
    <div class="zoom"><button data-zoom="in" aria-label="放大" data-en-label="Zoom in">+</button><button data-zoom="out" aria-label="缩小" data-en-label="Zoom out">−</button></div>
    <button class="expand" aria-label="打开大地图" data-en-label="Open the map"></button>
    <a class="badge credit" href="https://bettermapit.terryhu.cn/" target="_blank" rel="noopener" aria-label="BetterMapIt 地图 App" data-en-label="BetterMapIt, a map app"><img src="${BETTERMAPIT}" alt="" width="16" height="16"></a>
    <a class="badge made" href="https://github.com/terryHu7/homecraft" target="_blank" rel="noopener" aria-label="Made with homecraft"><img data-icon="logo" alt="" width="16" height="16"><b>homecraft</b></a>
  </div>
  <div id="weatherMenu" aria-label="天气与时段" data-en-label="Weather and time" hidden>
    <p class="now">获取天气中</p>
    <h2 data-en="Weather">天气</h2>
    <div role="radiogroup" aria-label="天气模式" data-en-label="Weather">
      <button type="button" role="radio" data-weather="auto" aria-checked="false" data-en="Live">实时</button>
      <button type="button" role="radio" data-weather="clear" aria-checked="true" data-en="Clear">晴天</button>
      <button type="button" role="radio" data-weather="overcast" aria-checked="false" data-en="Overcast">阴天</button>
      <button type="button" role="radio" data-weather="rain" aria-checked="false" data-en="Rain">下雨</button>
      <button type="button" role="radio" data-weather="fog" aria-checked="false" data-en="Mist">薄雾</button>
      <button type="button" role="radio" data-weather="haze" aria-checked="false" data-en="Haze">雾霾</button>
      <button type="button" role="radio" data-weather="snow" aria-checked="false" data-en="Snow">下雪</button>
      <button type="button" role="radio" data-weather="thunder" aria-checked="false" data-en="Storm">雷雨</button>
    </div>
    <h2 data-en="Time of day">时段</h2>
    <div role="radiogroup" aria-label="时段模式" data-en-label="Time of day">
      <button type="button" role="radio" data-time="auto" aria-checked="false" data-en="Live">实时</button>
      <button type="button" role="radio" data-time="dawn" aria-checked="false" data-en="Dawn">清晨</button>
      <button type="button" role="radio" data-time="morning" aria-checked="false" data-en="Morning">上午</button>
      <button type="button" role="radio" data-time="day" aria-checked="true" data-en="Day">白天</button>
      <button type="button" role="radio" data-time="dusk" aria-checked="false" data-en="Dusk">黄昏</button>
      <button type="button" role="radio" data-time="night" aria-checked="false" data-en="Night">夜晚</button>
    </div>
    <div class="actions"><button id="environmentReset" type="button" data-en="Back to live">恢复实时</button><button id="environmentDone" type="button" data-en="Done">完成</button></div>
    <p><span data-en="Weather data: ">天气数据：</span><a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></p>
  </div>
  <nav id="hotbar" aria-label="Dock"></nav>
  <div id="corner">
    <button id="webButton" aria-label="吐丝" data-en-label="Web" aria-pressed="false"><span></span></button>
    <button id="worldMapButton" aria-label="世界地图" data-en-label="World map" aria-pressed="false"><span></span></button>
    <button id="flyButton" aria-label="飞行" aria-pressed="false"><span></span></button>
    <button id="viewButton" aria-label="第一人称" data-en-label="First person" aria-pressed="false"><span></span></button>
    <button id="moodButton" aria-label="天气与时段" aria-expanded="false" aria-controls="weatherMenu"><span></span><b></b></button>
    <button id="soundButton" aria-label="声音" data-en-label="Sound" aria-pressed="false"><span></span></button>
  </div>
  <div id="tooltip" hidden></div>
  <div id="crosshair" hidden></div>
  <div id="aim" hidden></div>
  <button id="prompt" hidden><kbd>F</kbd><i class="icon"></i><span></span></button>
  <!-- Touch screens, flying by hand: Minecraft's pocket D-pad steers and the
       rocker climbs and descends (ui/flightpad.js). -->
  <div id="flightPad" hidden>
    <div class="dpad" role="group" aria-label="方向" data-en-label="Direction">
      <button type="button" data-dir="up" aria-label="向前" data-en-label="Forward" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>
      <button type="button" data-dir="left" aria-label="向左" data-en-label="Left" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button>
      <button type="button" data-dir="right" aria-label="向右" data-en-label="Right" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
      <button type="button" data-dir="down" aria-label="向后" data-en-label="Back" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    </div>
    <div class="lift" role="group" aria-label="升降" data-en-label="Up and down">
      <button type="button" data-lift="up" aria-label="上升" data-en-label="Up" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 6-6 6 6M6 18l6-6 6 6"/></svg></button>
      <button type="button" data-lift="down" aria-label="下降" data-en-label="Down" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 6 6 6-6M6 12l6 6 6-6"/></svg></button>
    </div>
  </div>
  <div id="phone"></div>
</div>

<div id="bigmap" hidden>
  <canvas aria-label="大地图，点哪里就走到哪里" data-en-label="Map: tap anywhere to walk there"></canvas>
  <button class="close" aria-label="关闭地图" data-en-label="Close the map">×</button>
</div>

<div id="worldmap" hidden>
  <canvas aria-label="世界地图：传送门网络的关系图" data-en-label="World map: the portal network as a graph"></canvas>
  <button class="close" aria-label="关闭世界地图" data-en-label="Close the world map">×</button>
  <p class="worldmap-status" role="status"></p>
</div>

<dialog id="panel" aria-labelledby="panelTitle">
  <header><i class="icon"></i><h2 id="panelTitle"></h2><button class="close" aria-label="关闭" data-en-label="Close">×</button></header>
  <div class="body" tabindex="-1"></div>
  <div class="work-controls" hidden>
    <button type="button" data-direction="-1" aria-label="上一个作品" data-en-label="Previous work"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
    <div class="work-tabs"></div>
    <span role="status" aria-live="polite" aria-atomic="true"></span>
    <button type="button" data-direction="1" aria-label="下一个作品" data-en-label="Next work"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button>
  </div>
</dialog>

<aside id="startupNotice" hidden aria-labelledby="startupTitle">
  <h2 id="startupTitle" data-en="The 3D view couldn’t start">3D 画面暂时未能启动</h2>
  <p id="startupMessage" data-en="You can try the 3D view again, or keep reading below.">可以重新进入 3D，下面的内容也可以继续阅读。</p>
  <button id="retry3D" class="mc-button" type="button" data-en="Try 3D again">重新进入 3D</button>
</aside>
`;

export function mountHud() {
  if (document.getElementById('hud')) return;
  const loading = document.getElementById('loading');
  const at = loading || document.getElementById('pages');
  at.insertAdjacentHTML('beforebegin', HUD);
}
