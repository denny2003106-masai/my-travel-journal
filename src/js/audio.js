/* ==========================================================================
   Travel Journal - Audio Recording & Speech-to-Text Module
   ========================================================================== */

let mediaRecorder = null;
let audioChunks = [];
let recognition = null;
let transcriptionResult = '';

/**
 * 取得適用於目前瀏覽器的 SpeechRecognition 物件
 */
function getSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('此瀏覽器不支援 Web Speech API 語音辨識');
    return null;
  }
  return SpeechRecognition;
}

/**
 * 啟動語音錄製與即時轉寫
 * @param {Object} options { onDataAvailable, onTranscript, onError }
 */
export async function startRecording(options = {}) {
  const { onTranscript, onError } = options;
  audioChunks = [];
  transcriptionResult = '';

  // 1. 取得麥克風權限並啟動錄音
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 偵測支援的 MIME 類型 (iOS 主要支援 audio/mp4 或 audio/aac, Android/Chrome 支援 audio/webm)
    let optionsMime = { mimeType: 'audio/webm' };
    if (MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported('audio/webm')) {
      optionsMime = { mimeType: 'audio/mp4' }; // Fallback for iOS
    }

    mediaRecorder = new MediaRecorder(stream, optionsMime);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    mediaRecorder.start();
  } catch (err) {
    console.error('無法啟動錄音器：', err);
    if (onError) onError('無法存取麥克風。請確認已授予麥克風權限！');
    return;
  }

  // 2. 啟動 Web Speech API 即時辨識 (以實現錄音即時轉文字儲存)
  const SpeechRecognition = getSpeechRecognition();
  if (SpeechRecognition) {
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'zh-TW'; // 設定繁體中文辨識

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
          transcriptionResult = currentText;
          if (onTranscript) {
            onTranscript(transcriptionResult, false); // 傳送最新辨識字串
          }
        }
      };

      recognition.onerror = (event) => {
        console.warn('語音辨識出錯：', event.error);
      };

      recognition.start();
    } catch (e) {
      console.warn('初始化語音辨識失敗：', e);
    }
  }
}

/**
 * 停止錄音與語音辨識
 * @returns {Promise<{audioBlob: Blob, text: string}>} 錄音檔 Blob 及轉寫文字
 */
export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder) {
      resolve({ audioBlob: null, text: '' });
      return;
    }

    // 停止語音辨識
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn(e);
      }
      recognition = null;
    }

    // 停止錄音
    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType;
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      
      // 關閉麥克風軌道以釋放硬體資源
      if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      
      mediaRecorder = null;
      resolve({
        audioBlob,
        text: transcriptionResult.trim()
      });
    };

    mediaRecorder.stop();
  });
}

/**
 * 檢查是否支援 Web Speech API 語音辨識
 */
export function isSpeechSupported() {
  return getSpeechRecognition() !== null;
}

/**
 * 對現有的音訊檔案進行事後語音辨識 (引導使用者播放並同步口述或用 Web Speech API 進行即時補錄)
 * 備註：瀏覽器 Web Speech API 基於隱私與安全，主要只接收麥克風音軌。
 * 我們在此提供一個「口述修正/轉錄」功能，讓使用者能在編輯手札或匯出時，開啟辨識來編輯文字。
 */
export function startDictation(onTranscript, onEnd, onError) {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    if (onError) onError('此瀏覽器不支援語音辨識');
    return null;
  }

  const dictation = new SpeechRecognition();
  dictation.continuous = true;
  dictation.interimResults = true;
  dictation.lang = 'zh-TW';

  dictation.onresult = (event) => {
    let text = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      text += event.results[i][0].transcript;
    }
    if (onTranscript) onTranscript(text);
  };

  dictation.onend = () => {
    if (onEnd) onEnd();
  };

  dictation.onerror = (e) => {
    if (onError) onError(e.error);
  };

  dictation.start();
  return dictation;
}
