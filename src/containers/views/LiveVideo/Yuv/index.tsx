import * as React from 'react'
import PhonePage from '@components/PhonePage'
import './style.less'

let schedued = false
let queue = []
let renderer: YuvCanvas = null

function Yuv() {
    const canvasRef = React.useRef<HTMLCanvasElement>()
    React.useEffect(() => {
        if (canvasRef) {
            initWs()
        }
    }, [])
    // 初始化socket
    const initWs = () => {
        const url = 'ws://localhost:9000/ws/test'
        const ws = new WebSocket(url)
        ws.binaryType = 'arraybuffer' // 字节流传送
        ws.onmessage = evt => {
            const data = evt.data
            if (typeof data != 'string') {
                queue.push(data) // 把二进制数据存储到列队中
                // 如果列队中数据，并且没有触发开始, 这里拉取的流没有直接渲染 而是通过requestAnimationFrame(即16.66ms 渲染)来绘制。 这样避免过快或者过慢的渲染导致bug
                if (!schedued) {
                    schedue()
                    schedued = true
                }
            } else {
                const res = JSON.parse(data)
                if (res.type == 'initial') {
                    initRender(canvasRef.current, res.data.width, res.data.height)
                }
            }
        }
    }
    // 初始化canvas
    const initRender = (canvas: HTMLCanvasElement, width: number, height: number) => {
        canvas.width = width
        canvas.height = height
        renderer = new YuvCanvas(canvas)
    }
    // 拉取流
    const schedue = () => {
        // 放入列队里面
        const data = queue.shift() // 拿去列队中第一个数据
        // 判断是否存在值
        if (data) {
            render(new Uint8Array(data))
            // 减少渲染延迟问题, 当列队中有多个数据时，延迟就会很严重,此时清空列队
            if (queue.length > 5) {
                queue = []
            }
            requestAnimationFrame(schedue) // 通过requestAnimationFrame提供流；  而不是直接拿到socket的流直接渲染；
        } else {
            // 没有数据关闭渲染通道
            schedued = false
        }
    }
    // 绘制画面
    const render = data => {
        if (renderer === null) return false
        const { width, height } = canvasRef.current
        renderer.renderImg(width, height, data)
    }
    return (
        <div className="yuv-box">
            <div className="yuv-info">
                <h4>Yuv 播放说明，</h4>
                <p>1、YUV https://juejin.im/post/5e8e714f6fb9a03c832b089c#heading-10</p>
                <p>2、YUV使用 https://juejin.im/post/5de29d7be51d455f9b335efa</p>
                <p>3、直播录制相关文章：https://aotu.io/notes/2016/10/09/HTML5-SopCast/</p>
                <p>
                    4、ffmpeg命令分析： ffmpeg -f avfoundation -r 30 -i "FaceTime HD Camera" -f rawvideo -c:v rawvideo -pix_fmt yuv420p "http://localhost:9000/push?id=test&width=320&height=240"
                    <span>-f avfoundation -r 30 -i "FaceTime HD Camera" 表示从 FaceTime HD Camera 中以 30 fps 的帧率采集视频</span>
                    <span>-f rawvideo 指视频的封装格式，为</span>
                    <span>-c:v rawvideo 表示输出视频编码格式为原始状态， 不进行解码</span>
                    <span>
                        主要参数： -i 设定输入流 -f 设定输出格式 -ss 开始时间 视频参数： -b 设定视频流量，默认为200Kbit/s -r 设定帧速率，默认为25 -s 设定画面的宽与高 -aspect 设定画面的比例 -vn 不处理视频 -vcodec
                        设定视频编解码器，未设定时则使用与输入流相同的编解码器 音频参数： -ar 设定采样率 -ac 设定声音的Channel数 -acodec 设定声音编解码器，未设定时则使用与输入流相同的编解码器 -an 不处理音频
                    </span>
                </p>
            </div>
            <PhonePage className="flex-1">
                <canvas ref={canvasRef}></canvas>
            </PhonePage>
        </div>
    )
}

class YuvCanvas {
    private canvas: HTMLCanvasElement
    private gl: WebGLRenderingContext
    constructor(canvas) {
        this.canvas = canvas
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
        this.init()
    }
    // 初始化
    private init() {
        let gl = this.gl
        if (!gl) {
            console.log('gl not support！')
            return
        }
        // 图像预处理
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        // GLSL 格式的顶点着色器代码
        let vertexShaderSource = `
                attribute lowp vec4 a_vertexPosition;
                attribute vec2 a_texturePosition;
                varying vec2 v_texCoord;
                void main() {
                    gl_Position = a_vertexPosition;
                    v_texCoord = a_texturePosition;
                }
            `
        let fragmentShaderSource = `
                precision lowp float;
                uniform sampler2D samplerY;
                uniform sampler2D samplerU;
                uniform sampler2D samplerV;
                varying vec2 v_texCoord;
                void main() {
                    float r,g,b,y,u,v,fYmul;
                    y = texture2D(samplerY, v_texCoord).r;
                    u = texture2D(samplerU, v_texCoord).r;
                    v = texture2D(samplerV, v_texCoord).r;
                    fYmul = y * 1.1643828125;
                    r = fYmul + 1.59602734375 * v - 0.870787598;
                    g = fYmul - 0.39176171875 * u - 0.81296875 * v + 0.52959375;
                    b = fYmul + 2.01723046875 * u - 1.081389160375;
                    gl_FragColor = vec4(r, g, b, 1.0);
                }
            `
        let vertexShader = this._compileShader(vertexShaderSource, gl.VERTEX_SHADER)
        let fragmentShader = this._compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER)

        let program = this._createProgram(vertexShader, fragmentShader)

        this._initVertexBuffers(program)

        // 激活指定的纹理单元
        gl.activeTexture(gl.TEXTURE0)
        gl.y = this._createTexture()
        gl.uniform1i(gl.getUniformLocation(program, 'samplerY'), 0)

        gl.activeTexture(gl.TEXTURE1)
        gl.u = this._createTexture()
        gl.uniform1i(gl.getUniformLocation(program, 'samplerU'), 1)

        gl.activeTexture(gl.TEXTURE2)
        gl.v = this._createTexture()
        gl.uniform1i(gl.getUniformLocation(program, 'samplerV'), 2)
    }
    /**
     * 初始化顶点 buffer
     * @param {glProgram} program 程序
     */

    _initVertexBuffers(program) {
        let gl = this.gl
        let vertexBuffer = gl.createBuffer()
        let vertexRectangle = new Float32Array([1.0, 1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0, -1.0, 0.0])
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
        // 向缓冲区写入数据
        gl.bufferData(gl.ARRAY_BUFFER, vertexRectangle, gl.STATIC_DRAW)
        // 找到顶点的位置
        let vertexPositionAttribute = gl.getAttribLocation(program, 'a_vertexPosition')
        // 告诉显卡从当前绑定的缓冲区中读取顶点数据
        gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0)
        // 连接vertexPosition 变量与分配给它的缓冲区对象
        gl.enableVertexAttribArray(vertexPositionAttribute)

        let textureRectangle = new Float32Array([1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0])
        let textureBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, textureRectangle, gl.STATIC_DRAW)
        let textureCoord = gl.getAttribLocation(program, 'a_texturePosition')
        gl.vertexAttribPointer(textureCoord, 2, gl.FLOAT, false, 0, 0)
        gl.enableVertexAttribArray(textureCoord)
    }

    /**
     * 创建并编译一个着色器
     * @param {string} shaderSource GLSL 格式的着色器代码
     * @param {number} shaderType 着色器类型, VERTEX_SHADER 或 FRAGMENT_SHADER。
     * @return {glShader} 着色器。
     */
    _compileShader(shaderSource, shaderType) {
        // 创建着色器程序
        let shader = this.gl.createShader(shaderType)
        // 设置着色器的源码
        this.gl.shaderSource(shader, shaderSource)
        // 编译着色器
        this.gl.compileShader(shader)
        const success = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)
        if (!success) {
            let err = this.gl.getShaderInfoLog(shader)
            this.gl.deleteShader(shader)
            console.error('could not compile shader', err)
            return
        }
        return shader
    }
    /**
     * 从 2 个着色器中创建一个程序
     * @param {glShader} vertexShader 顶点着色器。
     * @param {glShader} fragmentShader 片断着色器。
     * @return {glProgram} 程序
     */
    _createProgram(vertexShader, fragmentShader) {
        const gl = this.gl
        let program = gl.createProgram()

        // 附上着色器
        gl.attachShader(program, vertexShader)
        gl.attachShader(program, fragmentShader)

        gl.linkProgram(program)
        // 将 WebGLProgram 对象添加到当前的渲染状态中
        gl.useProgram(program)
        const success = this.gl.getProgramParameter(program, this.gl.LINK_STATUS)

        if (!success) {
            console.error('program fail to link' + this.gl.getShaderInfoLog(program))
            return
        }
        return program
    }
    /**
     * 设置纹理
     */
    _createTexture(filter = this.gl.LINEAR) {
        let gl = this.gl
        let t = gl.createTexture()
        // 将给定的 glTexture 绑定到目标（绑定点
        gl.bindTexture(gl.TEXTURE_2D, t)
        // 纹理包装 参考https://github.com/fem-d/webGL/blob/master/blog/WebGL基础学习篇（Lesson%207）.md -> Texture wrapping
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        // 设置纹理过滤方式
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
        return t
    }

    /**
     * 渲染图片出来
     * @param {number} width 宽度
     * @param {number} height 高度
     */
    renderImg(width, height, data) {
        let gl = this.gl
        // 设置视口，即指定从标准设备到窗口坐标的x、y仿射变换
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
        // 设置清空颜色缓冲时的颜色值
        gl.clearColor(0, 0, 0, 0)
        // 清空缓冲
        gl.clear(gl.COLOR_BUFFER_BIT)

        let uOffset = width * height
        let vOffset = (width >> 1) * (height >> 1)

        gl.bindTexture(gl.TEXTURE_2D, gl.y)
        // 填充纹理
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data.subarray(0, uOffset))

        gl.bindTexture(gl.TEXTURE_2D, gl.u)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width >> 1, height >> 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data.subarray(uOffset, uOffset + vOffset))

        gl.bindTexture(gl.TEXTURE_2D, gl.v)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width >> 1, height >> 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data.subarray(uOffset + vOffset, data.length))

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    /**
     * 根据重新设置 canvas 大小
     * @param {number} width 宽度
     * @param {number} height 高度
     * @param {number} maxWidth 最大宽度
     */
    setSize(width, height, maxWidth) {
        let canvasWidth = Math.min(maxWidth, width)
        this.canvas.width = canvasWidth
        this.canvas.height = (canvasWidth * height) / width
    }
    // 销毁
    destroy() {
        const { gl } = this
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
    }
}

export default Yuv