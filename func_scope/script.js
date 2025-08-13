class MultiVariableVisualizer {
    constructor() {
        this.variables = new Map();
        this.plotPoints = 100;
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        // 获取DOM元素
        this.functionInput = document.getElementById('function-input');
        this.parseButton = document.getElementById('parse-button');
        this.variableList = document.getElementById('variable-list');
        this.plotModeSelect = document.getElementById('plot-mode');
        this.xAxisSelect = document.getElementById('x-axis');
        this.yAxisSelect = document.getElementById('y-axis');
        this.variableControls = document.getElementById('variable-controls');
        this.updateButton = document.getElementById('update-plot');
        this.plotContainer = document.getElementById('plot-container');
    }

    bindEvents() {
        if (this.parseButton) {
            this.parseButton.addEventListener('click', () => this.parseFunction());
        }
        if (this.plotModeSelect) {
            this.plotModeSelect.addEventListener('change', () => this.onPlotModeChange());
        }
        if (this.updateButton) {
            this.updateButton.addEventListener('click', () => this.updatePlot());
        }
        if (this.functionInput) {
            this.functionInput.addEventListener('input', () => this.updateVariableInputs());
        }
    }

    parseVariables(expr) {
        const variables = new Set();
        const matches = expr.match(/\b[a-zA-Z][a-zA-Z0-9_]*\b/g) || [];
        matches.forEach(match => {
            const mathFunctions = [
                'Math', 'sin', 'cos', 'tan',
                'asin', 'acos', 'atan',
                'sinh', 'cosh', 'tanh',
                'exp', 'log', 'sqrt',
                'pow', 'abs', 'PI', 'E',
                'i', 'Infinity', 'NaN'
            ];
            if (!mathFunctions.includes(match)) {
                variables.add(match);
            }
        });
        return Array.from(variables);
    }

    updateVariableInputs() {
        if (!this.functionInput) return;
        
        const functionExpr = this.functionInput.value;
        const dimension = this.plotModeSelect ? this.plotModeSelect.value : '2D';
        const variables = this.parseVariables(functionExpr);
        
        if (this.variableControls) {
            this.variableControls.innerHTML = '';
            variables.forEach(variable => {
                const div = document.createElement('div');
                div.className = 'variable-control';
                div.innerHTML = `
                    <span>${variable}</span>
                    <input type="number" class="min-input" value="-10" placeholder="最小值">
                    <input type="number" class="max-input" value="10" placeholder="最大值">
                    <input type="number" class="value-input" value="0" placeholder="固定值">
                `;
                this.variableControls.appendChild(div);
            });
        }
    }

    parseFunction() {
        const expr = this.functionInput.value;
        try {
            // 使用math.js解析表达式
            const node = math.parse(expr);
            this.variables.clear();
            
            // 定义数学函数和常量
            const mathFunctions = [
                'sin', 'cos', 'tan',
                'asin', 'acos', 'atan',
                'sinh', 'cosh', 'tanh',
                'exp', 'log', 'sqrt',
                'pow', 'abs'
            ];
            const mathConstants = [
                'PI', 'E', 'i',
                'Infinity', 'NaN'
            ];
            
            node.traverse((node) => {
                if (node.type === 'SymbolNode') {
                    const name = node.name;
                    // 只添加非数学符号的变量
                    if (!mathFunctions.includes(name) && !mathConstants.includes(name)) {
                        this.variables.set(name, {
                            min: -10,
                            max: 10,
                            value: 0
                        });
                    }
                }
            });

            if (this.variables.size === 0) {
                throw new Error('未找到任何变量，请检查表达式是否正确');
            }

            this.updateVariableList();
            this.updateAxisSelects();
            this.updateVariableControls();
            this.updateButton.disabled = false;
            
            if (this.variables.size >= 2) {
                const vars = Array.from(this.variables.keys());
                this.xAxisSelect.value = vars[0];
                this.yAxisSelect.value = vars[1];
            }
        } catch (error) {
            alert('函数解析错误：' + error.message);
            console.error('解析错误详情：', error);
        }
    }

    updateVariableList() {
        this.variableList.innerHTML = '';
        this.variables.forEach((_, name) => {
            const div = document.createElement('div');
            div.className = 'variable-item';
            div.textContent = name;
            this.variableList.appendChild(div);
        });
    }

    updateAxisSelects() {
        const variables = Array.from(this.variables.keys());
        
        this.xAxisSelect.innerHTML = '';
        variables.forEach(variable => {
            const option = document.createElement('option');
            option.value = variable;
            option.textContent = variable;
            this.xAxisSelect.appendChild(option);
        });
        this.xAxisSelect.disabled = false;

        this.yAxisSelect.innerHTML = '';
        variables.forEach(variable => {
            const option = document.createElement('option');
            option.value = variable;
            option.textContent = variable;
            this.yAxisSelect.appendChild(option);
        });
        this.yAxisSelect.disabled = this.plotModeSelect.value === '2D';
    }

    updateVariableControls() {
        this.variableControls.innerHTML = '';
        this.variables.forEach((config, name) => {
            const div = document.createElement('div');
            div.className = 'variable-control';
            div.innerHTML = `
                <span>${name}</span>
                <input type="number" class="min-input" value="${config.min}" placeholder="最小值">
                <input type="number" class="max-input" value="${config.max}" placeholder="最大值">
                <input type="number" class="value-input" value="${config.value}" placeholder="固定值">
            `;
            this.variableControls.appendChild(div);
        });
    }

    onPlotModeChange() {
        const is3D = this.plotModeSelect.value === '3D';
        this.yAxisSelect.disabled = !is3D;
        if (!is3D) {
            this.yAxisSelect.value = '';
        }
    }

    updatePlot() {
        const expr = this.functionInput.value;
        const is3D = this.plotModeSelect.value === '3D';
        const xVar = this.xAxisSelect.value;
        const yVar = this.yAxisSelect.value;

        try {
            this.variables.forEach((config, name) => {
                const control = Array.from(this.variableControls.children).find(
                    child => child.querySelector('span').textContent === name
                );
                
                if (control) {
                    const minInput = control.querySelector('.min-input');
                    const maxInput = control.querySelector('.max-input');
                    const valueInput = control.querySelector('.value-input');
                    
                    if (minInput && maxInput && valueInput) {
                        config.min = parseFloat(minInput.value) || -10;
                        config.max = parseFloat(maxInput.value) || 10;
                        config.value = parseFloat(valueInput.value) || 0;
                    }
                }
            });

            if (is3D) {
                this.plot3D(expr, xVar, yVar);
            } else {
                this.plot2D(expr, xVar);
            }
        } catch (error) {
            console.error('更新图表错误:', error);
            alert('更新图表错误：' + error.message);
        }
    }

    plot2D(expr, xVar) {
        const xConfig = this.variables.get(xVar);
        const points = 100;
        const x = [];
        const y = [];
        const step = (xConfig.max - xConfig.min) / points;
        
        for (let i = 0; i <= points; i++) {
            const xVal = xConfig.min + i * step;
            x.push(xVal);
            
            try {
                const scope = {};
                scope[xVar] = xVal;
                
                this.variables.forEach((varConfig, varName) => {
                    if (varName !== xVar) {
                        scope[varName] = varConfig.value;
                    }
                });
                
                const result = math.evaluate(expr, scope);
                if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
                    y.push(result);
                } else {
                    y.push(0);
                }
            } catch (error) {
                y.push(0);
            }
        }
        
        const trace = {
            x: x,
            y: y,
            type: 'scatter',
            mode: 'lines',
            name: expr
        };
        
        const layout = {
            title: '2D函数图像',
            xaxis: {
                title: xVar,
                range: [xConfig.min, xConfig.max]
            },
            yaxis: {
                title: 'f(' + xVar + ')'
            },
            margin: { l: 50, r: 20, b: 50, t: 50 }
        };
        
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false
        };
        
        Plotly.newPlot(this.plotContainer, [trace], layout, config);
    }

    plot3D(expr, xVar, yVar) {
        const xConfig = this.variables.get(xVar);
        const yConfig = this.variables.get(yVar);
        const points = 40;
        const x = [];
        const y = [];
        const z = [];
        
        const xStep = (xConfig.max - xConfig.min) / points;
        const yStep = (yConfig.max - yConfig.min) / points;
        
        for (let i = 0; i <= points; i++) {
            x.push(xConfig.min + i * xStep);
            y.push(yConfig.min + i * yStep);
        }
        
        for (let i = 0; i <= points; i++) {
            const row = [];
            for (let j = 0; j <= points; j++) {
                try {
                    const scope = {};
                    scope[xVar] = x[j];
                    scope[yVar] = y[i];
                    
                    this.variables.forEach((varConfig, varName) => {
                        if (varName !== xVar && varName !== yVar) {
                            scope[varName] = varConfig.value;
                        }
                    });
                    
                    const result = math.evaluate(expr, scope);
                    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
                        row.push(result);
                    } else {
                        row.push(0);
                    }
                } catch (error) {
                    row.push(0);
                }
            }
            z.push(row);
        }
        
        const trace = {
            type: 'surface',
            x: x,
            y: y,
            z: z,
            colorscale: 'Viridis',
            opacity: 0.8
        };
        
        const layout = {
            title: '3D函数图像',
            scene: {
                xaxis: {
                    title: xVar,
                    range: [xConfig.min, xConfig.max]
                },
                yaxis: {
                    title: yVar,
                    range: [yConfig.min, yConfig.max]
                },
                zaxis: {
                    title: 'f(' + xVar + ',' + yVar + ')'
                },
                camera: {
                    eye: { x: 1.5, y: 1.5, z: 1.5 }
                }
            },
            margin: { l: 0, r: 0, b: 0, t: 30 }
        };
        
        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        };
        
        Plotly.newPlot(this.plotContainer, [trace], layout, config);
    }
}

// 等待DOM加载完成后初始化可视化器
document.addEventListener('DOMContentLoaded', () => {
    new MultiVariableVisualizer();
});