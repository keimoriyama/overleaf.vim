import { PdfDocument } from '../core/pdfViewEditorProvider.ts';
// import { StatusInfo } from '../scm.ts';


export type Events = {
  'fileWillOpenEvent': { uri: vscode.Uri },
  'pdfWillOpenEvent': { uri: vscode.Uri, pdfDocument: PdfDocument, webviewPanel: vscode.WebviewPanel },
  'spellCheckLanguageUpdatedEvent': { language: string },
  'compilerUpdateEvent': { compiler: string },
  'rootDocUpdateEvent': { rootDocId: string },
  'scmStatusChangeEvent': { status: StatusInfo },
  'socketConnectedEvent': { publicId: string },
}

export class EventBus {
  private static _eventEmitter = new EventEmitter();

  static fire<T extends keyof Events>(eventName: T, arg: Events[T]): void {
    EventBus._eventEmitter.emit(eventName, arg);
  }

  static on<T extends keyof Events>(eventName: T, cb: (arg: Events[T]) => void): vscode.Disposalbe {
    EventBus._eventEmitter.on(eventName, cb);
    const disposable = {
      dispose: () => { EventBus._eventEmitter.off(eventName, cb); },
    };
    return disposable;
  }
}
