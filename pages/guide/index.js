const app = getApp();
const GUIDE_AUDIO_URL = "";

const GUIDE_TEXT = {
  历史极客: "这件文物A处于时代转折点，工艺细节反映了礼制与技术的双重演化。",
  亲子家庭: "可以和孩子一起找找文物上的动物纹样，看看古人是如何讲故事的。",
  艺术爱好者: "重点观察器型比例与纹饰节奏，这件作品在留白处理上很有张力。",
  摄影打卡党: "建议从45度侧前方拍摄，能同时捕捉轮廓线和局部纹理高光。",
  default: "文物A是本馆高人气展品，建议先听讲解再看细节，会更有代入感。"
};

const CHIP_ORDER = ["map", "collect", "route", "qa"];
const DIVIDER_CLOSE_THRESHOLD = 34;

Page({
  data: {
    userTag: "",
    showCard: false,
    voiceStatusText: "当前为文字讲解（未配置语音资源）",
    currentZoneId: "",
    splitPane: {
      active: false,
      type: "",
      title: "",
      desc: ""
    },
    activeCard: {
      title: "",
      desc: ""
    },
    userPos: { x: 76, y: 380 },
    actionChips: {
      map: { x: 24, y: 520, initX: 24, initY: 520, animate: false, w: 120 },
      collect: { x: 156, y: 520, initX: 156, initY: 520, animate: false, w: 156 },
      route: { x: 326, y: 520, initX: 326, initY: 520, animate: false, w: 156 },
      qa: { x: 496, y: 520, initX: 496, initY: 520, animate: false, w: 156 }
    },
    zones: [
      { id: "relicA", x: 240, y: 248, w: 180, h: 112, title: "文物A" },
      { id: "bronze", x: 88, y: 120, w: 152, h: 96, title: "青铜器" },
      { id: "painting", x: 430, y: 126, w: 170, h: 98, title: "书画" }
    ]
  },

  onLoad() {
    const savedTag = wx.getStorageSync("userTag") || app.globalData.userTag || "轻松逛馆";
    this.setData({ userTag: savedTag });
    this.initActionChipPosition();

    this.audio = null;
    this.audioFailed = false;
    this.dividerTouchStartY = null;
    if (GUIDE_AUDIO_URL) {
      this.initVoiceAudio();
    }
  },

  onUnload() {
    this.clearTimer();
    if (this.splitPaneClearTimer) {
      clearTimeout(this.splitPaneClearTimer);
      this.splitPaneClearTimer = null;
    }
    if (this.chipResetTimers) {
      Object.keys(this.chipResetTimers).forEach((key) => {
        clearTimeout(this.chipResetTimers[key]);
      });
      this.chipResetTimers = null;
    }
    if (this.audio) {
      this.audio.destroy();
    }
  },

  initActionChipPosition() {
    const info = wx.getSystemInfoSync();
    const rpxToPx = info.windowWidth / 750;
    const chipHeight = 62 * rpxToPx;
    const safeBottom = info.safeArea ? info.windowHeight - info.safeArea.bottom : 0;
    const gap = 14 * rpxToPx;
    const initY = info.windowHeight - (234 * rpxToPx + safeBottom);

    const chipWidthPx = {
      map: 120 * rpxToPx,
      collect: 156 * rpxToPx,
      route: 156 * rpxToPx,
      qa: 156 * rpxToPx
    };

    const totalWidth =
      chipWidthPx.map + chipWidthPx.collect + chipWidthPx.route + chipWidthPx.qa + gap * 3;
    const startX = Math.max((info.windowWidth - totalWidth) / 2, 12 * rpxToPx);

    const initX = {
      map: startX,
      collect: 0,
      route: 0,
      qa: 0
    };
    initX.collect = initX.map + chipWidthPx.map + gap;
    initX.route = initX.collect + chipWidthPx.collect + gap;
    initX.qa = initX.route + chipWidthPx.route + gap;

    this.dropTarget = {
      x: info.windowWidth / 2,
      y: info.windowHeight / 2,
      threshold: 96 * rpxToPx
    };

    this.lastChipPositions = {};
    CHIP_ORDER.forEach((key) => {
      this.lastChipPositions[key] = { x: initX[key], y: initY };
    });
    this.chipResetTimers = {};

    this.setData({
      actionChips: {
        map: {
          x: initX.map,
          y: initY,
          initX: initX.map,
          initY,
          animate: false,
          w: chipWidthPx.map,
          h: chipHeight
        },
        collect: {
          x: initX.collect,
          y: initY,
          initX: initX.collect,
          initY,
          animate: false,
          w: chipWidthPx.collect,
          h: chipHeight
        },
        route: {
          x: initX.route,
          y: initY,
          initX: initX.route,
          initY,
          animate: false,
          w: chipWidthPx.route,
          h: chipHeight
        },
        qa: {
          x: initX.qa,
          y: initY,
          initX: initX.qa,
          initY,
          animate: false,
          w: chipWidthPx.qa,
          h: chipHeight
        }
      }
    });
  },

  goProfile() {
    wx.redirectTo({ url: "/pages/profile/index" });
  },

  onActionChipTap() {
    wx.showToast({
      title: "拖到页面中央可打开分屏",
      icon: "none"
    });
  },

  onActionChipChange(e) {
    if (!e || !e.detail || !e.currentTarget) return;
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this.lastChipPositions[key] = { x: e.detail.x, y: e.detail.y };
  },

  onActionChipDrop(e) {
    if (!e || !e.currentTarget) return;
    const key = e.currentTarget.dataset.key;
    if (!key) return;

    const chip = this.data.actionChips[key];
    const point = this.lastChipPositions[key] || { x: chip.x, y: chip.y };
    const chipCenterX = point.x + chip.w / 2;
    const chipCenterY = point.y + chip.h / 2;
    const target = this.dropTarget;
    const dx = chipCenterX - target.x;
    const dy = chipCenterY - target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= target.threshold) {
      this.openSplitPane(key);
    }

    this.resetActionChipPosition(key);
  },

  resetActionChipPosition(key) {
    const timer = this.chipResetTimers[key];
    if (timer) {
      clearTimeout(timer);
      this.chipResetTimers[key] = null;
    }

    const chip = this.data.actionChips[key];
    this.lastChipPositions[key] = {
      x: chip.initX,
      y: chip.initY
    };

    this.setData({
      [`actionChips.${key}.x`]: chip.initX,
      [`actionChips.${key}.y`]: chip.initY,
      [`actionChips.${key}.animate`]: true
    });

    this.chipResetTimers[key] = setTimeout(() => {
      this.setData({ [`actionChips.${key}.animate`]: false });
    }, 220);
  },

  openSplitPane(key) {
    if (this.splitPaneClearTimer) {
      clearTimeout(this.splitPaneClearTimer);
      this.splitPaneClearTimer = null;
    }

    const paneMap = {
      map: {
        type: "map",
        title: "馆内地图",
        desc: "上半屏展示地图定位，下半屏可继续对话。"
      },
      collect: {
        type: "collect",
        title: "今日馆藏",
        desc: "推荐你从热门文物开始，优先看讲解时长短、信息密度高的展区。"
      },
      route: {
        type: "route",
        title: "快速路线",
        desc: "已为你准备约20分钟路线：入口导览区 -> 文物A -> 书画区 -> 服务台。"
      },
      qa: {
        type: "qa",
        title: "亲子问答",
        desc: "可从“这件文物像什么”“它是做什么用的”开始，引导孩子主动观察细节。"
      }
    };

    const pane = paneMap[key] || {
      type: "guide",
      title: "导览",
      desc: "可继续拖拽按钮探索更多内容。"
    };

    this.setData({
      splitPane: {
        active: true,
        type: pane.type,
        title: pane.title,
        desc: pane.desc
      }
    });
  },

  onSplitDividerTouchStart(e) {
    if (!this.data.splitPane.active) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this.dividerTouchStartY = touch.clientY;
  },

  onSplitDividerTouchMove(e) {
    if (this.dividerTouchStartY === null) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this.dividerTouchLastY = touch.clientY;
  },

  onSplitDividerTouchEnd(e) {
    if (this.dividerTouchStartY === null) return;
    const touch =
      (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || null;
    const endY = touch ? touch.clientY : this.dividerTouchLastY;
    const deltaY = typeof endY === "number" ? endY - this.dividerTouchStartY : 0;

    this.dividerTouchStartY = null;
    this.dividerTouchLastY = null;

    if (deltaY <= -DIVIDER_CLOSE_THRESHOLD) {
      this.closeSplitPane();
    }
  },

  closeSplitPane() {
    if (!this.data.splitPane.active) return;

    this.setData({
      "splitPane.active": false
    });

    this.splitPaneClearTimer = setTimeout(() => {
      if (!this.data.splitPane.active) {
        this.setData({
          "splitPane.type": "",
          "splitPane.title": "",
          "splitPane.desc": ""
        });
      }
      this.splitPaneClearTimer = null;
    }, 360);
  },

  startSimulate() {
    if (this.timer) return;
    this.pathIndex = 0;
    this.simPath = [
      { x: 100, y: 360 },
      { x: 130, y: 332 },
      { x: 164, y: 310 },
      { x: 200, y: 292 },
      { x: 235, y: 280 },
      { x: 258, y: 266 },
      { x: 282, y: 258 },
      { x: 306, y: 252 },
      { x: 336, y: 248 }
    ];

    this.timer = setInterval(() => {
      if (this.pathIndex >= this.simPath.length) {
        this.stopSimulate();
        return;
      }
      const next = this.simPath[this.pathIndex];
      this.pathIndex += 1;
      this.setData({ userPos: next });
      this.checkZoneTrigger(next);
    }, 900);
  },

  stopSimulate() {
    this.clearTimer();
  },

  resetSimulate() {
    this.clearTimer();
    this.lastTriggeredZone = "";
    this.setData({
      userPos: { x: 76, y: 380 },
      currentZoneId: "",
      showCard: false
    });
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  checkZoneTrigger(point) {
    const matched = this.data.zones.find((zone) => {
      return (
        point.x >= zone.x &&
        point.x <= zone.x + zone.w &&
        point.y >= zone.y &&
        point.y <= zone.y + zone.h
      );
    });

    if (!matched) {
      this.setData({ currentZoneId: "" });
      return;
    }

    this.setData({ currentZoneId: matched.id });

    if (matched.id === "relicA" && this.lastTriggeredZone !== "relicA") {
      this.lastTriggeredZone = "relicA";
      this.openGuideCard();
      this.playVoice();
    }
  },

  openGuideCard() {
    const text = GUIDE_TEXT[this.data.userTag] || GUIDE_TEXT.default;
    this.setData({
      showCard: true,
      activeCard: {
        title: "文物A自动讲解",
        desc: text
      }
    });
  },

  closeCard() {
    this.setData({ showCard: false });
  },

  playVoice() {
    if (!this.audio || this.audioFailed) {
      this.setData({
        voiceStatusText: this.audioFailed
          ? "语音加载失败，已切换文字讲解"
          : "当前为文字讲解（未配置语音资源）"
      });
      return;
    }

    this.audio.stop();
    this.audio.play();
    this.setData({
      voiceStatusText: "已为你自动播放语音讲解"
    });
  },

  initVoiceAudio() {
    this.audio = wx.createInnerAudioContext();
    this.audio.autoplay = false;
    this.audio.obeyMuteSwitch = false;
    this.audio.src = GUIDE_AUDIO_URL;
    this.audio.onError(() => {
      this.audioFailed = true;
      this.setData({
        voiceStatusText: "语音加载失败，已切换文字讲解"
      });
      if (this.audio) {
        this.audio.destroy();
        this.audio = null;
      }
    });
  }
});