export class CoordinateManager {
	constructor(canvas) {
		this.canvas = canvas;
	}

	toNormalized(screenX, screenY) {
		return {
			x: screenX / this.canvas.width,
			y: screenY / this.canvas.height
		};
	}

	toScreen(normalizedX, normalizedY) {
		return {
			x: normalizedX * this.canvas.width,
			y: normalizedY * this.canvas.height
		};
	}

	computeNewPosition(startNormX, startNormY, deltaX, deltaY) {
		const normDeltaX = deltaX / this.canvas.width;
		const normDeltaY = deltaY / this.canvas.height;

		// Clamp results to [0.0 - 1.0] range
		return {
			x: Math.min(1.0, Math.max(0.0, startNormX + normDeltaX)),
			y: Math.min(1.0, Math.max(0.0, startNormY + normDeltaY))
		};
	}

	resizeCanvas(width, height) {
		this.canvas.width = width;
		this.canvas.height = height;
	}
}