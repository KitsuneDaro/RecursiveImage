$(() => {
    new Main($('#mainCanvas').get(0), $('#imgFileInput').get(0), $('#maxTimesInput').get(0));
});

class Main {
    constructor(mainCanvas, inputImg, inputTimes) {
        this.mainCanvas = mainCanvas;
        this.mainCtx = this.mainCanvas.getContext('2d');

        this.inputImg = inputImg;

        this.inputImg.addEventListener('change', (e) => {
            let file = e.target.files;
            let reader = new FileReader();

            reader.readAsDataURL(file[0]);

            reader.onload = () => {
                this.readImg(reader.result);
            }
        });

        this.inputTimes = inputTimes;

        this.inputTimes.value = 3;
        this.inputTimes.min = 0;

        this.reimg = null;
        this.interval = null;
    }

    readImg(src) {
        if (this.interval != null) {
            clearInterval(this.interval);
        }
        let img = new Image();
        img.src = src;

        img.onload = () => {
            this.mainCanvas.width = img.naturalWidth;
            this.mainCanvas.height = img.naturalHeight;

            let imgCanvas = $('<canvas>').get(0);
            let imgCtx = imgCanvas.getContext('2d');

            imgCanvas.width = img.naturalWidth;
            imgCanvas.height = img.naturalHeight;

            imgCtx.drawImage(img, 0, 0, img.width, img.height);

            let imgData = imgCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);

            this.reimg = new RecursiveImage(this.mainCtx, imgData);

            this.intervalTime = 1;
            this.interval = setInterval(() => {
                let start = performance.now();
                let i = 0;

                while (i < this.inputTimes.value && (performance.now() - start) < (this.intervalTime / 2)) {
                    if (!this.reimg.divide(2)) {
                        clearInterval(this.interval);
                    }
                    i += 1;
                }

                if (i < this.inputTimes.value && this.inputTimes.max === undefined) {
                    this.inputTimes.value = i + 1;
                    this.inputTimes.max = i + 1;
                }
            }, this.intervalTime);
        }
    }
}

class RecursiveImage {
    constructor(ctx, imgData) {
        this.ctx = ctx;
        this.imgData = imgData;
        this.maxPriority = 0;
        this.maxSfx = 0;

        let range = new Range2D(0, 0, this.imgData.width, this.imgData.height);
        this.rangePrioritys = [new RangePriority(range, imgData, 1)];
    }

    divide(divisionPart) {
        if (this.rangePrioritys.length == 0) {
            return false;
        }

        let rangePriority = this.rangePrioritys.pop();
        let range = rangePriority.range;
        let partWidth = range.width / divisionPart;
        let partHeight = range.height / divisionPart;

        for (let x = 0; x < divisionPart; x++) {
            let fx = range.sx + x * partWidth;
            let sx = Math.floor(fx);
            let ex = Math.floor(fx + partWidth);

            for (let y = 0; y < divisionPart; y++) {
                let fy = range.sy + y * partHeight;
                let sy = Math.floor(fy);
                let ey = Math.floor(fy + partHeight);

                let partRange = new Range2D(sx, sy, ex, ey);
                let partRangePriority = new RangePriority(partRange, this.imgData, rangePriority.divisionCount + 1);

                this.draw(partRangePriority);

                if (range.width > 1 && range.height > 1) {
                    this.addRangePriority(partRangePriority, 0, this.rangePrioritys.length - 1);
                }
            }
        }

        return true;
    }

    addRangePriority(rangePriority, left, right) {
        if (left > right) {
            this.rangePrioritys.splice(left, 0, rangePriority);
            return undefined;
        }

        let mid = Math.floor((left + right) / 2);

        if (rangePriority.priority < this.rangePrioritys[mid].priority) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }

        this.addRangePriority(rangePriority, left, right);
    }

    drawAll() {
        this.rangePrioritys.forEach((rangePriority) => {
            this.draw(rangePriority);
        });
    }

    draw(rangePriority) {
        let range = rangePriority.range;
        let fillStyle = 'rgba(';

        for (let i = 0; i < 3; i++) {
            fillStyle += rangePriority.average[i] + ',';
        }

        this.ctx.fillStyle = fillStyle + '1)';
        this.ctx.fillRect(range.sx, range.sy, range.width, range.height);
        this.ctx.fillStyle = '#000000';
        this.ctx.beginPath();
        this.ctx.rect(range.sx, range.sy, range.width, range.height);
        this.ctx.stroke();
    }
}

class RangePriority {
    constructor(range, imgData, divisionCount) {
        this.range = range;
        this.imgData = imgData;
        this.divisionCount = divisionCount;

        this.evalAverage();
        this.evalVariance();
        this.evalPriority();
    }

    evalAverage() {
        this.average = [0, 0, 0];
        let sum = [0, 0, 0];

        for (let y = this.range.sy; y < this.range.ey; y++) {
            let sfx = this.getImgDataSfx(this.range.sx, y);

            for (let x = this.range.sx; x < this.range.ex; x++) {
                for (let i = 0; i < 3; i++) {
                    sum[i] += this.imgData.data[sfx + i];
                }

                sfx += 4;
            }
        }

        for (let i = 0; i < 3; i++) {
            this.average[i] = Math.floor(sum[i] / this.range.area);
        }
    }

    evalVariance() {
        this.variance = [0, 0, 0];

        for (let y = this.range.sy; y < this.range.ey; y++) {
            let sfx = this.getImgDataSfx(this.range.sx, y);

            for (let x = this.range.sx; x < this.range.ex; x++) {
                for (let i = 0; i < 3; i++) {
                    this.variance[i] += ((this.imgData.data[sfx + i] - this.average[i]) / 256) ** 2 / this.range.area;
                }

                sfx += 4;
            }
        }
    }

    evalPriority() {
        this.priority = 0;

        for (let i = 0; i < 3; i++) {
            this.priority += this.variance[i];
        }

        this.priority /= this.divisionCount ** 2;
    }

    getImgDataSfx(x, y) {
        return 4 * (x + y * this.imgData.width);
    }
}

class Range2D {
    constructor(sx, sy, ex, ey) {
        this.sx = sx;
        this.sy = sy;
        this.ex = ex;
        this.ey = ey;
        this.width = ex - sx;
        this.height = ey - sy;
        this.area = this.width * this.height;
    }
}