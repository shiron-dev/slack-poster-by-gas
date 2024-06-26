const SLACK_TOKEN
  = PropertiesService.getScriptProperties().getProperty("SLACK_TOKEN");

const TEIREI = "定例";
const OFFICE_TEIREI_TEMP = PropertiesService.getScriptProperties().getProperty("OFFICE_TEIREI_TEMP");
const OFFICE_TEIREI_DIR = PropertiesService.getScriptProperties().getProperty("OFFICE_TEIREI_DIR");
const OFFICE_CHANNEL = "C067YFG5V1V";

type EventCategory = "全体" | string;
type Department = "執行部" | string;

interface EventPlan<T extends EventCategory | Department> {
  category: T;
  event: string;
}

// eslint-disable-next-line unused-imports/no-unused-vars
function sendSlackMessages() {
  // スプレッドシートを開く
  const spreadsheet = SpreadsheetApp.openByUrl(
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_URL"),
  );
  const sheet = spreadsheet.getSheetByName("calender");

  const dateList = sheet.getRange("2:2").getValues()[0];

  // 今日の日付を取得
  const today = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  today.setHours(0, 0, 0, 0); // 時間をリセット

  // SlackチャンネルID
  const channelId = "C0764JFK5ED";

  for (let i = 0; i < dateList.length; i++) {
    const cellDate = new Date(
      new Date(dateList[i]).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
    );
    cellDate.setHours(0, 0, 0, 0);

    if (cellDate.getTime() === today.getTime()) {
      const col = sheet
        .getRange(`${getClmName(i + 1)}:${getClmName(i + 1)}`)
        .getValues();
      const titles = sheet.getRange("A:A").getValues();

      const mtgSheet = spreadsheet.getSheetByName("mtg");
      const mtgTitles = mtgSheet.getRange("A:A").getValues();
      const mtg = mtgSheet
        .getRange(`${getClmName(i + 1)}:${getClmName(i + 1)}`)
        .getValues();

      const message = formatMessage(cellDate, titles, col, mtgTitles, mtg);
      if (!message) {
        break;
      }
      sendToSlack(channelId, message);
      {
        const col = sheet
          .getRange(`${getClmName(i + 2)}:${getClmName(i + 2)}`)
          .getValues();
        const mtg = mtgSheet
          .getRange(`${getClmName(i + 2)}:${getClmName(i + 2)}`)
          .getValues();

        const plan: EventPlan<EventCategory>[] = col
          .map((v, i) => ({ category: String(titles[i][0]) as EventCategory, event: String(v[0]) }))
          .filter((v, i) => i > 3 && v.category !== "");
        const mtgPlan: EventPlan<Department>[] = mtg
          .map((v, i) => ({ category: String(mtgTitles[i][0]) as Department, event: String(v[0]) }))
          .filter((v, i) => i > 4 && v.category !== "");
        const afterDate = new Date(cellDate);
        afterDate.setDate(afterDate.getDate() + 1);
        beforeSchedule(afterDate, plan, mtgPlan);
      }
      break;
    }
  }
}

function beforeSchedule(date: Date, plan: EventPlan<EventCategory>[], mtgPlan: EventPlan<Department>[]) {
  for (const event of mtgPlan) {
    switch (event.category) {
      case "執行部":
        if (event.event === TEIREI) {
          const id = makeTemp(toFormatDate(date, "yyyy/MM/dd"), OFFICE_TEIREI_TEMP, OFFICE_TEIREI_DIR);
          const url = DriveApp.getFileById(id).getUrl();
          const message = `<!channel> 明日、${toFormatDate(date, "yyyy/MM/dd (E)")}は定例です！\n`
            + `議事録は<${url}|${toFormatDate(date, "yyyy/MM/dd")}の議事録>にあります\n`
            + "事前に記入しておいてください";
          sendToSlack(OFFICE_CHANNEL, message);
        }
        break;
    }
  }
}

function makeTemp(title: string, original: string, dir: string): string {
  const temp = DriveApp.getFileById(original).makeCopy(title, DriveApp.getFolderById(dir));
  return temp.getId();
}

// メッセージのフォーマット
function formatMessage(date, titles, col, mtgTitles, mtg) {
  // 必要に応じてメッセージのフォーマットを変更
  const content = col
    .map((v, i) => [titles[i][0], v[0]])
    .filter((v, i) => i > 3 && v[1] !== "")
    .map(v =>
      v[1].endsWith("!") ? `${v[0]}: *【重要】*${v[1]}` : `${v[0]}: ${v[1]}`,
    )
    .join("\n");
  const mtgContent = mtg
    .map((v, i) => [mtgTitles[i][0], v[0]])
    .filter((v, i) => i > 4 && v[1] !== "")
    .map(v => `${v[0]}: ${v[1]}`)
    .join("\n");
  const formattedDate = toFormatDate(date, "yyyy/MM/dd (E)");

  const formatContent = content === "" ? "" : `*今日の予定*\n${content}`;
  const formatMTG
    = mtgContent === "" ? "" : `*今日のミーティング*\n${mtgContent}`;
  const formatHead = `${content === "" ? "" : "<!channel> "}${formattedDate}`;
  if (formatContent === "" && formatMTG === "") {
    return null;
  }
  return [formatHead, formatContent, formatMTG].join("\n");
}

type DateFormattedType = "yyyy/MM/dd (E)" | "yyyy/MM/dd";

function toFormatDate(date: Date, formattedType: DateFormattedType): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const week = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  switch (formattedType) {
    case "yyyy/MM/dd (E)":
      return `${year}/${month}/${day} (${week})`;
    case "yyyy/MM/dd":
      return `${year}/${month}/${day}`;
  }
  return "";
}

/**
 * シートの列番号をアルファベットの列名称に変換する。
 * 例: 5 => "E", 100 => "CV"
 * @param {number} clmNum 列番号
 * @return {string} アルファベットの列名称
 */
function getClmName(clmNum) {
  // 数字ではなかった場合はエラー
  if (Number.isNaN(clmNum))
    throw new Error(`列番号が数字ではありません。 clmNum: ${clmNum}`);
  // アルファベット文字数26文字なので、列番号を26進数の扱いに直す。
  let syo = Math.floor(clmNum / 26); // 26で割った商
  let amari = clmNum % 26; // 26で割った余り
  // 余りが0の場合は、微調整する。
  if (amari === 0) {
    syo--;
    amari = 26;
  }
  // 列名称2桁目（以上）のアルファベットを特定する。
  const parent
    = syo > 26
      ? getClmName(syo) // 商の値が26を超える場合は、ループ処理する。
      : syo > 0
        ? String.fromCharCode("A".charCodeAt(0) + syo - 1) // 商の値が0より大きく26以下の場合は、対応するアルファベット１文字に変換する。
        : ""; // 商が0の場合は空欄とする。
  // 列名称1桁目のアルファベットを特定する。
  const child = String.fromCharCode("A".charCodeAt(0) + amari - 1); // 余りの値に対応するアルファベット１文字に変換する。
  return parent + child;
}

// Slackにメッセージを送信
function sendToSlack(channelId, message) {
  const url = "https://slack.com/api/chat.postMessage";
  const payload = {
    channel: channelId,
    text: message,
  };

  const options = {
    method: "post" as any,
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN}`,
    },
    payload: JSON.stringify(payload),
  };

  UrlFetchApp.fetch(url, options);
}
