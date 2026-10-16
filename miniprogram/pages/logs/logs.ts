// logs.ts
// const util = require('../../utils/util.js')
import { formatTime } from '../../utils/util'

type LogItem = {
  date: string;
  timeStamp: string;
};

type LogsData = { logs: LogItem[] };
type LogsInstance = WechatMiniprogram.Component.Instance<LogsData, {}, {}>;

Component<LogsData, {}, {}>({
  data: {
    logs: [] as LogItem[],
  },
  lifetimes: {
    attached() {
      this.setData({
        logs: (wx.getStorageSync('logs') || []).map((log: string) => {
          return {
            date: formatTime(new Date(log)),
            timeStamp: log
          }
        }),
      })
    }
  } as { attached(): void } & ThisType<LogsInstance>,
})
