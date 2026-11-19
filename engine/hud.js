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
    <button id="photoButton" aria-label="拍照与分享" data-en-label="Photo & Share" aria-pressed="false"><span></span></button>
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
  <div id="photoStudio" hidden>
    <div class="photo-viewfinder">
      <div class="photo-crop-frame" title="按住拖拽取景框，双击复位居中">
        <div class="photo-live-mac-bar" aria-hidden="true">
          <div class="live-mac-traffic">
            <span class="live-dot-close"></span>
            <span class="live-dot-min"></span>
            <span class="live-dot-max"></span>
          </div>
          <div class="live-mac-capsule">
            <span class="live-mac-domain"></span>
          </div>
        </div>
        <div class="photo-corners">
          <span class="p-edge t" title="按住拖拽调节高度" data-en-title="Drag to resize height"></span>
          <span class="p-edge b" title="按住拖拽调节高度" data-en-title="Drag to resize height"></span>
          <span class="p-edge l" title="按住拖拽调节宽度" data-en-title="Drag to resize width"></span>
          <span class="p-edge r" title="按住拖拽调节宽度" data-en-title="Drag to resize width"></span>
          <span class="p-corner tl" title="按住拖拽调节大小" data-en-title="Drag to resize"></span>
          <span class="p-corner tr" title="按住拖拽调节大小" data-en-title="Drag to resize"></span>
          <span class="p-corner bl" title="按住拖拽调节大小" data-en-title="Drag to resize"></span>
          <span class="p-corner br" title="按住拖拽调节大小" data-en-title="Drag to resize"></span>
          <span class="p-center-mark" aria-hidden="true"></span>
        </div>
        <div class="photo-live-watermark" aria-hidden="true">
          <img class="live-wm-logo" alt="" />
          <span class="live-wm-text">homecraft</span>
        </div>
      </div>
    </div>
    <div class="photo-bar" role="toolbar" aria-label="拍照控制台" data-en-label="Photo studio toolbar">
      <div class="photo-drag-handle" title="按住拖拽控制栏，双击复位" data-en-title="Drag to move, double-click to reset" aria-hidden="true">
        <span class="drag-pill"></span>
      </div>

      <div class="photo-capsule-strip">
        <div class="photo-top-pills">
          <!-- 1. 窗口标题栏开关 (Toggle Window Header Bar - 最左侧独立快捷开关) -->
          <button type="button" class="photo-toggle-pill on" data-toggle-frame="mac" aria-pressed="true" title="切换顶部窗口栏" data-en-title="Toggle top window bar">
            <svg class="win-header-icon" width="16" height="13" viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="1" y="1" width="16" height="12" rx="2.5"></rect>
              <line x1="1" y1="4.5" x2="17" y2="4.5"></line>
              <circle cx="3.5" cy="2.8" r="0.7" fill="currentColor"></circle>
              <circle cx="5.5" cy="2.8" r="0.7" fill="currentColor"></circle>
            </svg>
          </button>

          <!-- 2. 画幅比例 (Ratio: 16:9, 9:16, 1:1) -->
          <div class="photo-dock-item">
            <button type="button" class="photo-capsule" data-trigger-popover="ratio" aria-expanded="false" title="画幅比例" data-en-title="Aspect Ratio">
              <span class="cap-text" id="capRatioText">16:9</span>
              <svg class="cap-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>

            <div class="photo-popover ratio-popover" id="popoverRatio" hidden data-popover-for="ratio">
              <div class="popover-arrow" aria-hidden="true"></div>
              <div class="popover-header">
                <span class="popover-title" data-en="Aspect Ratio">画幅</span>
              </div>
              <div class="popover-list" role="radiogroup" aria-label="画幅">
                <button type="button" class="popover-row-btn" data-ratio="free" title="自由任意尺寸" data-en-title="Freeform">
                  <span class="ratio-val" data-en="Free">自由</span>
                  <span class="ratio-icon-cell" aria-hidden="true"><span class="ratio-rect r-free"></span></span>
                </button>
                <button type="button" class="popover-row-btn on" data-ratio="16:9" title="16:9 横屏" data-en-title="16:9 Landscape">
                  <span class="ratio-val">16:9</span>
                  <span class="ratio-icon-cell" aria-hidden="true"><span class="ratio-rect r-16-9"></span></span>
                </button>
                <button type="button" class="popover-row-btn" data-ratio="9:16" title="9:16 竖屏" data-en-title="9:16 Portrait">
                  <span class="ratio-val">9:16</span>
                  <span class="ratio-icon-cell" aria-hidden="true"><span class="ratio-rect r-9-16"></span></span>
                </button>
                <button type="button" class="popover-row-btn" data-ratio="1:1" title="1:1 方幅" data-en-title="1:1 Square">
                  <span class="ratio-val">1:1</span>
                  <span class="ratio-icon-cell" aria-hidden="true"><span class="ratio-rect r-1-1"></span></span>
                </button>
              </div>
            </div>
          </div>

          <!-- 3. 收纳式场景调节 (Tucked-away Scene Adjustments: Angle, Time & Weather) -->
          <div class="photo-dock-item">
            <button type="button" class="photo-capsule photo-scene-capsule" data-trigger-popover="scene" aria-expanded="false" title="场景与环境调节（机位、光影、天气）" data-en-title="Scene & Weather adjustments">
              <span class="cap-icon" id="capSceneIcon">🎛️</span>
              <span class="cap-text" id="capSceneText">场景</span>
              <svg class="cap-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>

            <!-- Anchored Popover: Apple Pencil style cascading rightwards -->
            <div class="photo-popover scene-popover" id="popoverScene" hidden data-popover-for="scene">
              <div class="popover-arrow" aria-hidden="true"></div>

              <div class="scene-cascade-layout">
                <!-- Column 1: 机位 -->
                <div class="scene-column">
                  <span class="column-header" data-en="Angle">机位</span>
                  <div class="scene-list" role="radiogroup" aria-label="机位">
                    <button type="button" class="scene-pill on" data-angle="current">
                      <span class="pill-icon">🎯</span>
                      <span data-en="Current">当前</span>
                    </button>
                    <button type="button" class="scene-pill" data-angle="aerial">
                      <span class="pill-icon">🏝️</span>
                      <span data-en="Bird's-eye">鸟瞰</span>
                    </button>
                    <button type="button" class="scene-pill" data-angle="selfie">
                      <span class="pill-icon">🤳</span>
                      <span data-en="Selfie">自拍</span>
                    </button>
                    <button type="button" class="scene-pill" data-angle="spawn">
                      <span class="pill-icon">🚪</span>
                      <span data-en="Default">默认</span>
                    </button>
                  </div>
                </div>

                <div class="cascade-divider" aria-hidden="true"></div>

                <!-- Column 2: 光影 -->
                <div class="scene-column">
                  <span class="column-header" data-en="Lighting">光影</span>
                  <div class="scene-list" role="radiogroup" aria-label="光影">
                    <button type="button" class="scene-pill on" data-photo-time="current">
                      <span class="pill-icon">⏱️</span>
                      <span data-en="Current">当前</span>
                    </button>
                    <button type="button" class="scene-pill" data-photo-time="day">
                      <span class="pill-icon">☀️</span>
                      <span data-en="Day">白天</span>
                    </button>
                    <button type="button" class="scene-pill" data-photo-time="dusk">
                      <span class="pill-icon">🌅</span>
                      <span data-en="Dusk">黄昏</span>
                    </button>
                    <button type="button" class="scene-pill" data-photo-time="night">
                      <span class="pill-icon">🌙</span>
                      <span data-en="Night">夜晚</span>
                    </button>
                  </div>
                </div>

                <div class="cascade-divider" aria-hidden="true"></div>

                <!-- Column 3: 天气 -->
                <div class="scene-column">
                  <span class="column-header" data-en="Weather">天气</span>
                  <div class="scene-list" role="radiogroup" aria-label="天气">
                    <button type="button" class="scene-pill on" data-photo-weather="current">
                      <span class="pill-icon">⛅</span>
                      <span data-en="Current">当前</span>
                    </button>
                    <button type="button" class="scene-pill" data-photo-weather="clear">
                      <span class="pill-icon">☀️</span>
                      <span data-en="Clear">晴朗</span>
                    </button>
                    <button type="button" class="scene-pill" data-photo-weather="rain">
                      <span class="pill-icon">🌧️</span>
                      <span data-en="Rain">雨天</span>
                    </button>
                    <button type="button" class="scene-pill" data-photo-weather="snow">
                      <span class="pill-icon">❄️</span>
                      <span data-en="Snow">雪天</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="cap-divider" aria-hidden="true"></div>

        <div class="photo-shutter-row">
          <!-- 4. 视角快捷切换按键 (自拍 / 场景视角快速翻转) -->
          <button type="button" class="photo-quick-flip" id="photoQuickFlip" aria-label="自拍与场景视角切换" data-en-label="Toggle selfie/scene" title="切换自拍与场景" data-en-title="Toggle selfie/scene">
            <span class="flip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
            </span>
          </button>

          <!-- 5. 保存截图快门 -->
          <button type="button" id="photoSnapSave" class="photo-save-btn" aria-label="保存截图" data-en-label="Save screenshot">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            <span data-en="Save">保存截图</span>
          </button>

          <!-- 6. 退出拍照按键 -->
          <button type="button" id="photoClose" class="photo-close-btn" aria-label="退出拍照" data-en-label="Exit photo mode">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    </div>
    <div id="photoToast" hidden></div>
  </div>
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
