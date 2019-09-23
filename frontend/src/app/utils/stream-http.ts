import {from, Observable} from "rxjs";
import {filter, map, scan, flatMap} from "rxjs/operators";

export function getStreamObservable<T>(url): Observable<T> {
  const xhr = new XMLHttpRequest();

  const textStream = extractStream(xhr, { endWithNewline: true });
  const jsonStream = collate(textStream).pipe(
    flatMap((v: string[]) => from(v)),
    map((jsonData: string) => JSON.parse(jsonData))
  );

  xhr.open("GET", url);
  xhr.setRequestHeader('stream', 'true');
  xhr.send();

  return jsonStream;
}

function extractStream(xhr, options) {
  return new Observable((subscriber) => {
    let charactersSeen = 0;

    function notified() {
      if (xhr.readyState >= 3 && xhr.responseText.length > charactersSeen) {
        subscriber.next(xhr.responseText.substring(charactersSeen));
        charactersSeen = xhr.responseText.length;
      }
      if (xhr.readyState == 4) {
        if (options.endWithNewline && xhr.responseText[xhr.responseText.length - 1] != "\n") subscriber.next("\n");
        subscriber.complete();
      }
    }
    xhr.onreadystatechange = notified;
    xhr.onprogress = notified;
    xhr.onerror = (e) => subscriber.error(event);
  });
}

interface ILineSeparator {
  isLine: boolean,
  line: string,
  nextLine: string
}

function collate(stream) {
  return stream.pipe(
    scan((state, data: string) => {
      const index = data.lastIndexOf('\n');
      const startOfLine = state.nextLine;
      if (index >= 0) {
        const line = startOfLine + data.substring(0, index + 1);
        const nextLine = data.substring(index+1);
        return {
          isLine: true,
          line: line,
          nextLine: nextLine
        }
      } else {
        return {
          isLine: false,
          line: '',
          nextLine: data,
        };
      }
    }, { isLine: true, nextLine: '', line: '' }),
    filter((x: ILineSeparator) => x.isLine),
    map((x: ILineSeparator) => x.line.split('\n').filter((i) => i.length > 0))
  );
}