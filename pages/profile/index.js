const app = getApp();

Page({
  data: {
    tagInput: "",
    quickTags: ["历史极客", "亲子家庭", "艺术爱好者", "摄影打卡党", "轻松逛馆"]
  },

  onLoad() {
    const saved = wx.getStorageSync("userTag");
    if (saved) {
      this.setData({ tagInput: saved });
    }
  },

  onInput(e) {
    this.setData({ tagInput: (e.detail.value || "").trim() });
  },

  pickTag(e) {
    const tag = e.currentTarget.dataset.tag || "";
    this.setData({ tagInput: tag });
  },

  confirmTag() {
    const tag = this.data.tagInput.trim();
    if (!tag) {
      wx.showToast({
        title: "请先输入身份标签",
        icon: "none"
      });
      return;
    }

    app.globalData.userTag = tag;
    wx.setStorageSync("userTag", tag);
    wx.redirectTo({
      url: "/pages/guide/index"
    });
  }
});
