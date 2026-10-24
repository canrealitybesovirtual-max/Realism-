/**
 * Four-function calculator state machine with the behaviour people expect
 * from a desk calculator: chained operations evaluate left to right,
 * repeated "=" repeats the last operation, % and +/- act on the display.
 */
export type Op = '+' | '-' | '×' | '÷';

export class Calculator {
	display = '0';
	private acc: number | null = null;
	private op: Op | null = null;
	private fresh = true; // next digit starts a new number
	private lastOp: Op | null = null;
	private lastOperand = 0;
	error = false;

	private get value() { return parseFloat(this.display); }

	private show(n: number) {
		if (!isFinite(n)) { this.display = 'Error'; this.error = true; return; }
		// 12 significant digits, trim float noise
		let s = parseFloat(n.toPrecision(12)).toString();
		if (s.length > 14) s = n.toExponential(8).replace(/\.?0+e/, 'e');
		this.display = s;
	}

	digit(d: string) {
		if (this.error) this.clear();
		if (this.fresh) { this.display = d === '.' ? '0.' : d; this.fresh = false; return; }
		if (d === '.' && this.display.includes('.')) return;
		if (this.display.replace(/[-.]/g, '').length >= 14) return;
		this.display = this.display === '0' && d !== '.' ? d : this.display + d;
	}

	private apply(a: number, op: Op, b: number): number {
		switch (op) {
			case '+': return a + b;
			case '-': return a - b;
			case '×': return a * b;
			case '÷': return a / b;
		}
	}

	operator(op: Op) {
		if (this.error) return;
		if (this.op !== null && !this.fresh) {
			const r = this.apply(this.acc!, this.op, this.value);
			this.show(r);
			this.acc = r;
		} else if (this.op === null || this.acc === null) {
			this.acc = this.value;
		}
		this.op = op;
		this.fresh = true;
	}

	equals() {
		if (this.error) return;
		if (this.op !== null) {
			// "5 + =" uses the displayed value (5) as the operand, like a desk calculator
			this.lastOp = this.op;
			this.lastOperand = this.value;
			this.show(this.apply(this.acc!, this.op, this.lastOperand));
			this.acc = null;
			this.op = null;
		} else if (this.lastOp !== null) {
			this.show(this.apply(this.value, this.lastOp, this.lastOperand));
		}
		this.fresh = true;
	}

	percent() { if (!this.error) { this.show(this.acc !== null && this.op && (this.op === '+' || this.op === '-') ? this.acc * this.value / 100 : this.value / 100); this.fresh = true; } }
	negate() { if (!this.error && this.display !== '0') this.display = this.display.startsWith('-') ? this.display.slice(1) : '-' + this.display; }
	backspace() {
		if (this.error || this.fresh) return;
		this.display = this.display.length > 1 && !(this.display.length === 2 && this.display.startsWith('-')) ? this.display.slice(0, -1) : '0';
	}
	clear() { this.display = '0'; this.acc = null; this.op = null; this.fresh = true; this.error = false; this.lastOp = null; }

	/** Map a keyboard key to an action; returns true if handled. */
	key(k: string): boolean {
		if (/^[0-9.]$/.test(k)) { this.digit(k); return true; }
		const ops: Record<string, Op> = { '+': '+', '-': '-', '*': '×', 'x': '×', '/': '÷' };
		if (ops[k]) { this.operator(ops[k]); return true; }
		if (k === '=' || k === 'Enter') { this.equals(); return true; }
		if (k === 'Escape' || k === 'c' || k === 'C') { this.clear(); return true; }
		if (k === 'Backspace') { this.backspace(); return true; }
		if (k === '%') { this.percent(); return true; }
		return false;
	}

	get pendingOp(): Op | null { return this.op; }
}
