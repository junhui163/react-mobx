import JSZip from 'jszip';
import axios from 'axios';
import PubSub from 'pubsub-js'

interface UitlsProps {
    nativeTimelineLoadConfig: (file: string, path: string) => boolean;
    nativeTimelineUpdateParam: (effect: number, param: string) => void;
    nativeTimelineGetTrackAt: (track: number) => number;
    nativeTimelineGetClipAt: (track: number, clip: number) => number;
    nativeTimelineGetEffectAt: (clip: number, effect: number) => number;
    nativeSetBackgroundColor: (r: number, g: number, b: number, a: number) => void;
    nativeUnzip: (file: string, path: string) => boolean;
    nativeSnapshot: (key: number, filename: string, quality: number) => void;
    nativeSeek: (key: number) => void;
    nativeTimelineUpdateBinaryParam: (effect: number, key: string, data: number, w: number, h: number) => void;
    nativeTimelineFindObjectByName: (name: string) => number;
    nativeTimelineGetObjectType: (object: number) => number;
    nativeClipUpdateResource: (clip: number, path: string) => number;
    nativeInit: (width: number, height: number) => boolean;
    nativeReset: () => void;
    nativePlay: () => void;
}

export class Display {
    private uitls: UitlsProps
    private canvas: HTMLCanvasElement
    private isWasmLoaded: boolean = false
    private dirName: string
    private sourceUrl: string
    private isZipLoaded: boolean = false
    private effectData: any
    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        window.Module = {
            canvas: canvas,
            onRuntimeInitialized: () => {
                this.isWasmLoaded = true
                const { FS, IDBFS } = window
                console.timeEnd("########loadWasm")
                console.log('wasm初始化挂在成功')
                // 使用IndexDB 
                FS.mkdir("/data"); // 存储目录
                FS.mount(IDBFS, {}, "/data"); // 挂在IndexDB,
                FS.syncfs(true, function (err: Error) { // syncfs()方法进行内存数据与IndexedDB的双向同步
                    console.log("FS ERROR", err);
                });
                this.onWasmLoad();
                this.openEffect()
            }
        }
    }

    /**
     * 初始化数据
     * @param {string} zipUrl
     * @memberof Display
     */
    async loadZip(zipUrl: string) {
        const files = await this.loadZipFile(zipUrl)
        try {
            const pList = []
            let p: any;
            let jsTxt: any
            for (const filename of Object.keys(files)) {
                if (/\.(js)$/.test(filename)) {
                    p = files[filename].async('text').then((content) => {
                        jsTxt = content
                        return 2
                    })
                } else {
                    p = files[filename].async('arraybuffer').then((res) => {
                        const { Module } = window;
                        window.Module = {
                            ...Module,
                            wasmBinary: new Uint8Array(res),
                        }
                        return 1
                    });
                }
                pList.push(p)
            }
            Promise.all(pList).then(() => {
                const script = document.createElement('script');
                script.setAttribute('type', 'text/javascript');
                script.text = jsTxt;
                document.body.appendChild(script);
                document.body.removeChild(script);
            })
        } catch (error) {
            console.error('error')
        }
    }

    /**
     * 加载解析zip文件
     * @param {string} zipUrl
     * @return {*} 
     * @memberof Display
     */
    private async loadZipFile(zipUrl: string) {
        console.time("########loadWasm")
        console.time('loading')
        console.time('#loadingZip')
        const response = await this.loadZipRequst(zipUrl);
        console.timeEnd('#loadingZip')
        const zipData = await JSZip.loadAsync(response.data).then((zip) => {
            return zip
        });
        console.timeEnd('loading')
        return zipData.files
    }

    /**
     * 加载zip 文件
     * @param {string} zipUrl
     * @return {*} 
     * @memberof Display
     */
    private async loadZipRequst(zipUrl: string) {
        return await axios({
            url: zipUrl,
            method: "GET",
            responseType: "arraybuffer",
        })
    }

    /**
     * JS 调用C/C++方法,可以传递不同类型的参数;因为JS和C/C++ 只有Number类型是相通的。传递其他类型会报错，为了解决这个问题，Module提供了两个方法ccall/cwrap。 
     * Number类型不能是64位整数型，因为JS会丢失精度、会截取。所以C/C++不能返回64位数
     * cwrap(ident, returnType, argTypes) ident: C导出的函数名称, returnType: 返回的类型。 argTypes: C导出函数接受参数的类型
     * @memberof Display
     */
    private onWasmLoad() {
        const { Module } = window;
        this.uitls = {
            nativeTimelineLoadConfig: Module.cwrap("nativeTimelineLoadConfig", "bool", ["string", "string",]),
            nativeTimelineUpdateParam: Module.cwrap("nativeTimelineUpdateParam", null, ["number", "string"]),
            nativeTimelineGetTrackAt: Module.cwrap("nativeTimelineGetTrackAt", "number", ["number"]),
            nativeTimelineGetClipAt: Module.cwrap("nativeTimelineGetClipAt", "number", ["number", "number"]),
            nativeTimelineGetEffectAt: Module.cwrap("nativeTimelineGetEffectAt", "number", ["number", "number"]),
            nativeUnzip: Module.cwrap("nativeUnzip", "bool", ["string", "string"]),
            nativeSnapshot: Module.cwrap("nativeSnapshot", null, ["number", "string", "number"]),
            nativeSeek: Module.cwrap("nativeSeek", null, ["number"]),
            nativeSetBackgroundColor: Module.cwrap("nativeSetBackgroundColor", null, ["number", "number", "number", "number",]),
            nativeTimelineUpdateBinaryParam: Module.cwrap("nativeTimelineUpdateBinaryParam", null, ["number", "string", "number", "number", "number"]),
            nativePlay: Module.cwrap('nativePlay', null, null),
            nativeInit: Module.cwrap('nativeInit', "bool", ['number', 'number']),
            nativeReset: Module.cwrap("nativeReset", null, null),
            nativeTimelineFindObjectByName: Module.cwrap('nativeTimelineFindObjectByName', "number", ["string"]),
            nativeTimelineGetObjectType: Module.cwrap("nativeTimelineGetObjectType", "number", ["number"]),
            nativeClipUpdateResource: Module.cwrap("nativeClipUpdateResource", null, ["number", "string"])
        };
        Module["doNotCaptureKeyboard"] = true;
        try {
            this.uitls.nativeSetBackgroundColor(1.0, 1.0, 1.0, 1.0);
            this.uitls?.nativeInit(1200, 1200);
        } catch (error) {
            console.log(error, 'error')
        }
    }

    /**
     * 加载资源
     * @param {string} lowUrl
     * @param {string} [sourceUrl]
     * @memberof Display
     */
    async loadResource(lowUrl: string, sourceUrl?: string) {
        console.time('====loadResource====')
        const arr = lowUrl.split('/');
        const path = arr[arr.length - 1].split('.')[0];
        this.dirName = `/data/${path}` || '/data/cloth';
        this.sourceUrl = sourceUrl || '';
        try {
            const res = await this.loadZipRequst(lowUrl)
            this.effectData = new Uint8Array(res.data);
            this.isZipLoaded = true
            console.timeEnd('====loadResource====')
            this.openEffect();
        } catch (error) {
            console.log(error)
        }
    }

    /**
     * 获取资源加载；写入C/C++
     * @private
     * @memberof Display
     */
    async openEffect() {
        const { FS } = window;
        if (this.isZipLoaded && this.isWasmLoaded && this.effectData) {
            console.time('###openLowEffect')
            // C/C++中写入文件
            FS.writeFile(`${this.dirName}.zip`, this.effectData);
            console.log(this.dirName)
            this.uitls?.nativeUnzip(`${this.dirName}.zip`, this.dirName);
            // 调用syncfs异步函数。判断是否成功
            FS.syncfs((err: Error) => {
                console.log("syncfs success?" + (!err ? "YES" : "NO"));
                // 调用C/C++ 方法
                this.uitls?.nativeTimelineLoadConfig(
                    `${this.dirName}/timeline.sky`,
                    this.dirName
                );
                this.uitls?.nativePlay();
                console.timeEnd('###openLowEffect');
                PubSub.publish('laoded', true)
            });
        }
    }

    /**
     * 更新渲染数据。
     * @param {number} t
     * @param {number} c
     * @param {number} e
     * @param {Record<any, any>} param
     * @memberof Display
     */
    updateRender(t: number, c: number, e: number, param: Record<any, any>) {
        const track = this.uitls?.nativeTimelineGetTrackAt(t) || 0;
        console.log("track = " + track);
        const clip = this.uitls?.nativeTimelineGetClipAt(track, c) || 0;
        console.log("clip = " + clip);
        const effect = this.uitls?.nativeTimelineGetEffectAt(clip, e) || 0;
        console.log("effect = " + effect);
        this.uitls?.nativeTimelineUpdateParam(
            effect,
            JSON.stringify({ ofParam: param })
        );
    };

    /**
     * 调用C/C++ 绘制图形到模型器
     * @param {Uint8Array} data
     * @param {number} width
     * @param {number} height
     * @param {*} settingInfo
     * @param {*} [target]
     * @memberof Display
     */
    updateWasm(data: Uint8Array, width: number, height: number, settingInfo: any, target?: any) {
        console.log(settingInfo, 'settingInfo=================')
        if (settingInfo) {
            let effect = 0;
            if (target) {
                const track = this.uitls?.nativeTimelineGetTrackAt(target.trackIndex) || 0;
                const clip = this.uitls?.nativeTimelineGetClipAt(track, target.clipIndex) || 0;
                effect = this.uitls?.nativeTimelineGetEffectAt(clip, target.effectIndex) || 0;
            }
            const { paramSettingInfo } = settingInfo;
            if (settingInfo.binary == undefined) {
                const ptr = window.Module._malloc(data.byteLength);
                settingInfo["binaryPtr"] = ptr;
            }
            settingInfo["binary"] = this.updateWASMHeap(settingInfo["binaryPtr"], data);
            paramSettingInfo.forEach((it: {
                paramType: string; filterIndex: string; paramName: string; objName: string
            }) => {
                if (it.objName) {
                    effect = this.uitls?.nativeTimelineFindObjectByName(it.objName) || 0;
                }
                switch (it.paramType) {
                    case "binary":
                        this.uitls?.nativeTimelineUpdateBinaryParam(effect, it.filterIndex + ":" + it.paramName, settingInfo["binary"].byteOffset, width, height);
                        // settingInfo["binary"] = null;
                        break;
                    case "randomNum":
                        const r = Math.floor(Math.random() * 99999);
                        this.uitls?.nativeTimelineUpdateParam(effect, JSON.stringify({ ofParam: { [`${it.filterIndex + ":" + it.paramName}`]: r } }));
                        break;
                }
            });
        }
    }

    updateWASMHeap(ptr: any, data: Uint8Array) {
        const heapBytes = new Uint8Array(window.Module.HEAPU8.buffer, ptr, data.byteLength);
        heapBytes.set(new Uint8Array(data.buffer));
        return heapBytes;
    }
}
