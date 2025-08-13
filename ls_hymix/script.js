// UI 元素
const fileInput = document.getElementById('file-input');
const dropArea = document.getElementById('drop-area');
const sheetSelect = document.getElementById('sheet-select');
const dataTable = document.getElementById('data-table');
const resultTable = document.getElementById('result-table');
const startBtn = document.getElementById('start-calc-btn');
const exportBtn = document.getElementById('export-btn');
const plotBtn = document.getElementById('plot-btn');
const status = document.getElementById('status');
const typeSelect = document.getElementById('type-select');
const methodSelect = document.getElementById('method-select');
const plotArea = document.getElementById('plot-area');

// 内存
let wb = null;
let sheetNames = [];
let sheetsData = {}; // sheetName -> array of arrays
let resultState = null;

// ========== 辅助函数 ==========
function setStatus(txt, isError = false) {
  status.textContent = `状态：${txt}`;
  status.classList.remove('loading-text');
  if (txt.includes('计算中')) {
    status.classList.add('loading-text');
  }
  status.classList.toggle('text-danger', isError);
}

function clearTable(tableElement) {
  tableElement.innerHTML = '';
}

function arrayToHtmlTable(arr, tableElement) {
  clearTable(tableElement);
  if (!arr || arr.length === 0) {
    tableElement.innerHTML = '<thead><tr><th>（空）</th></tr></thead>';
    return;
  }
  const header = arr[0];
  const hasHeader = header.some(c => typeof c === 'string' && c.trim() !== '');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  if (hasHeader) {
    const tr = document.createElement('tr');
    header.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h === undefined ? '' : String(h);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    for (let i = 1; i < arr.length; i++) {
      const row = arr[i];
      const tr2 = document.createElement('tr');
      row.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = (cell === undefined || cell === null) ? '' : cell;
        tr2.appendChild(td);
      });
      tbody.appendChild(tr2);
    }
  } else {
    const cols = Math.max(...arr.map(r => r.length));
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      th.textContent = `C${c + 1}`;
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    arr.forEach(row => {
      const tr2 = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        td.textContent = (row && row[c] !== undefined) ? row[c] : '';
        tr2.appendChild(td);
      }
      tbody.appendChild(tr2);
    });
  }
  tableElement.appendChild(thead);
  tableElement.appendChild(tbody);
}

// 黄金分割搜索
function goldenSectionMin(f, a = 0, b = 1, tol = 1e-6, maxIter = 120) {
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = f(c), fd = f(d);
  let iter = 0;
  while ((b - a) > tol && iter < maxIter) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = f(d);
    }
    iter++;
  }
  const x = (a + b) / 2;
  return { x, fx: f(x) };
}

// 读取 workbook 为数组
function readWorkbookArrays(workbook) {
  const names = workbook.SheetNames.slice();
  const map = {};
  names.forEach(nm => {
    const ws = workbook.Sheets[nm];
    const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    map[nm] = arr;
  });
  return { names, map };
}

// 提取系数矩阵 a, b
function extractCoeffsFromSheetArr(arr) {
  if (!arr || arr.length < 2) throw new Error('系数表行数不足');
  let aRow, bRow;
  if (arr.length >= 3 && arr[1].some(v => v !== '') && arr[2].some(v => v !== '')) {
    aRow = arr[1].slice(1);
    bRow = arr[2].slice(1);
  } else {
    aRow = arr[0].slice(1);
    bRow = arr[1].slice(1);
  }
  const a = aRow.map(v => parseFloat(v) || 0);
  const b = bRow.map(v => parseFloat(v) || 0);
  let n = Math.max(a.length, b.length);
  while (n > 0 && (a[n - 1] === 0 && b[n - 1] === 0)) n--;
  return { a: a.slice(0, n), b: b.slice(0, n), n };
}

// 提取参数矩阵
function extractParamsFromSheetArr(arr, n) {
  if (!arr || arr.length === 0) return [];
  const first = arr[0];
  const hasHeader = first.some(c => typeof c === 'string' && c.trim() !== '');
  const dataRows = hasHeader ? arr.slice(1) : arr.slice(0);
  const params = dataRows.map(r => {
    const row = [];
    for (let i = 0; i < n; i++) {
      row.push(parseFloat((r[i] !== undefined && r[i] !== '') ? r[i] : NaN));
    }
    return row;
  }).filter(r => r.some(v => !isNaN(v)));
  return params;
}

// 油 - 线性最小二乘法
function calcOilLinear(a, b, params) {
  const n = a.length;
  const A = a.map((ai, i) => ai - b[i]);
  const AT_A = A.reduce((sum, ai) => sum + ai * ai, 0);

  const results = [];
  params.forEach(row => {
    const Y = row.map((pi, i) => pi - b[i]);
    const AT_Y = A.reduce((sum, ai, i) => sum + ai * Y[i], 0);
    const x = AT_A === 0 ? 0 : AT_Y / AT_A;
    const predicted = a.map((ai, i) => ai * x + b[i] * (1 - x));
    results.push({ x, y: [...row], predicted });
  });
  return results;
}

// 油 - 非线性最小二乘法
function calcOilNonlinear(a, b, params) {
  const n = a.length;
  const results = [];

  params.forEach(row => {
    const objective = (x) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const pred = a[i] * x + b[i] * (1 - x);
        const r = pred - row[i];
        sum += r * r;
      }
      return sum / n; // ✅ 平均残差平方和
    };

    const res = goldenSectionMin(objective, 0, 1, 1e-7, 200);
    const x = res.x;
    const predicted = a.map((ai, i) => ai * x + b[i] * (1 - x));
    results.push({ x, y: [...row], predicted });
  });

  return results;
}

// 气 - 非线性最小二乘法（关键：动态列名）
function calcGasNonlinear(a, b, params) {
  const n = a.length;
  if (n % 2 !== 0) throw new Error('系数列数不是偶数');
  const half = n / 2;
  const a_c = a.slice(0, half);     // 组分系数
  const a_i = a.slice(half);        // 同位素系数
  const b_c = b.slice(0, half);
  const b_i = b.slice(half);

  // 从第二个 Sheet 的 header 行读取列名（后 half 个为同位素名）
  const paramSheetName = sheetNames[1];
  const headerRow = sheetsData[paramSheetName]?.[0] || [];
  const isotopeNames = headerRow.slice(half, half + half); // 后 half 个列名

  // 如果列名为空，用默认名
  const fallbackNames = Array.from({ length: half }, (_, i) => `同位素${i + 1}`);
  const varNames = isotopeNames.map((name, i) => (name && name.trim() !== '') ? name.trim() : fallbackNames[i]);

  const results = [];
  params.forEach(row => {
    const isotopeObs = row.slice(half, half + half);
    const objective = (x) => {
      let s = 0;
      for (let j = 0; j < half; j++) {
        const num = x * a_c[j] * a_i[j] + (1 - x) * b_c[j] * b_i[j];
        const den = x * a_c[j] + (1 - x) * b_c[j];
        const pred = den === 0 ? 0 : num / den;
        const r = (pred - (isotopeObs[j] || 0));
        s += r * r;
      }
      return s / half; // ✅ 平均残差平方和
    };
    const res = goldenSectionMin(objective, 0, 1, 1e-7, 300);
    const x = res.x;
    const predicted = [];
    for (let j = 0; j < half; j++) {
      const num = x * a_c[j] * a_i[j] + (1 - x) * b_c[j] * b_i[j];
      const den = x * a_c[j] + (1 - x) * b_c[j];
      predicted.push(den === 0 ? 0 : num / den);
    }
    results.push({ x, y: isotopeObs, predicted });
  });

  return { results, varNames }; // 返回实际同位素名称
}

// 构建导出表格（支持动态列名）
function buildResultTableForExport(type, varNames, calcResults) {
  const headers = ['索引', 'x'];
  // 原始参数
  varNames.forEach(name => headers.push(`原始-${name}`));
  // 计算参数
  varNames.forEach(name => headers.push(`计算-${name}`));
  // 相对误差
  varNames.forEach(name => headers.push(`相对误差-${name}`));
  // 平均误差
  headers.push('平均误差');

  const rows = [headers];
  for (let i = 0; i < calcResults.length; i++) {
    const r = calcResults[i];
    const idx = i + 1;
    const x = r.x.toFixed(6);

    // 原始值
    const orig = r.y.map(v => (isNaN(v) ? '' : v.toFixed(4)));
    // 计算值
    const pred = r.predicted.map(v => (isNaN(v) ? '' : v.toFixed(4)));
    // 相对误差
    const rel = orig.map((ov, j) => {
      if (!ov || ov === '' || parseFloat(ov) === 0) return '';
      const re = Math.abs((parseFloat(pred[j]) - parseFloat(ov)) / parseFloat(ov)) * 100;
      return (Math.round(re * 100) / 100).toFixed(2);
    });
    // 平均误差
    const validRel = rel.filter(v => v !== '');
    const meanErr = validRel.length > 0
      ? (validRel.reduce((s, n) => s + parseFloat(n), 0) / validRel.length).toFixed(2)
      : '';

    rows.push([idx, x, ...orig, ...pred, ...rel, meanErr]);
  }
  return rows;
}

// 导出为 Excel
function exportToExcel(rows, filename = 'calculation_result.xlsx') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wbout = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbout, ws, '结果');
  XLSX.writeFile(wbout, filename);
}

// ✅ 修改：绘图函数（每行最多 2 个子图，正方形，坐标轴统一）
function plotPredictionScatter(varNames, y_true, y_pred) {
  plotArea.innerHTML = '';
  const n = varNames.length;

  // 计算全局范围（所有数据）
  const allX = y_true.flat().filter(isFinite);
  const allY = y_pred.flat().filter(isFinite);
  const allVals = [...allX, ...allY];
  let minVal = Math.min(...allVals);
  let maxVal = Math.max(...allVals);
  if (!isFinite(minVal)) minVal = 0;
  if (!isFinite(maxVal)) maxVal = 1;
  const margin = 0.05 * (maxVal - minVal);
  const range = [minVal - margin, maxVal + margin];

  for (let i = 0; i < n; i++) {
    const name = varNames[i];
    const xData = y_true.map(row => row[i]);
    const yData = y_pred.map(row => row[i]);

    // 创建子图容器
    const cell = document.createElement('div');
    plotArea.appendChild(cell);

    // 散点图数据
    const trace = {
      x: xData,
      y: yData,
      mode: 'markers',
      type: 'scatter',
      marker: { size: 6 , color: '#007bff' },
      name: '样本'
    };

    // 参考线 y = x
    const line = {
      x: range,
      y: range,
      mode: 'lines',
      line: { dash: 'dash', color: 'red' },
      name: 'y=x'
    };

    // 布局：固定宽高，统一坐标轴范围
    const layout = {
      title: name,
      margin: { l: 40, r: 10, t: 36, b: 40 },
      xaxis: { title: '实测值', range },
      yaxis: { title: '计算值', range },
      showlegend: false
    };

    // 绘制子图
    Plotly.newPlot(cell, [trace, line], layout, { responsive: false });
  }
}

// 显示结果表
function displayResultTable(aoa) {
  clearTable(resultTable);
  if (!aoa || aoa.length === 0) {
    resultTable.innerHTML = '<tr><td>(无)</td></tr>';
    return;
  }
  const thead = document.createElement('thead');
  const thr = document.createElement('tr');
  aoa[0].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    thr.appendChild(th);
  });
  thead.appendChild(thr);
  const tbody = document.createElement('tbody');
  for (let i = 1; i < aoa.length; i++) {
    const tr = document.createElement('tr');
    aoa[i].forEach(cell => {
      const td = document.createElement('td');
      td.textContent = (cell === undefined || cell === null) ? '' : cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  resultTable.appendChild(thead);
  resultTable.appendChild(tbody);
}

// ========== 事件绑定 ==========
fileInput.addEventListener('change', (ev) => {
  const f = ev.target.files?.[0];
  if (!f) return;
  handleFile(f);
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
});

['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => dropArea.classList.add('highlight'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => dropArea.classList.remove('highlight'), false);
});

dropArea.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length > 0) handleFile(files[0]);
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = e.target.result;
      wb = XLSX.read(data, { type: 'binary' });
      const { names, map } = readWorkbookArrays(wb);
      sheetNames = names;
      sheetsData = map;

      sheetSelect.innerHTML = '';
      names.forEach((nm, idx) => {
        const op = document.createElement('option');
        op.value = nm;
        op.textContent = `${idx + 1}. ${nm}`;
        sheetSelect.appendChild(op);
      });
      sheetSelect.value = names[0];
      arrayToHtmlTable(sheetsData[names[0]] || [], dataTable);

      setStatus(`已加载 ${names.length} 个工作表`);
      resultTable.innerHTML = '';
      exportBtn.disabled = true;
      plotBtn.disabled = true;
      resultState = null;
    } catch (err) {
      console.error(err);
      setStatus('读取文件失败，请检查格式。', true);
    }
  };
  reader.readAsBinaryString(file);
}

sheetSelect.addEventListener('change', (e) => {
  const sel = e.target.value;
  if (!sel) return;
  arrayToHtmlTable(sheetsData[sel] || [], dataTable);
});

startBtn.addEventListener('click', () => {
  if (!wb) {
    setStatus('请先导入 Excel 文件。', true);
    return;
  }
  if (sheetNames.length < 2) {
    setStatus('至少需要两个工作表。', true);
    return;
  }

  setStatus('计算中');
  startBtn.disabled = true;
  startBtn.textContent = '计算中...';

  setTimeout(() => {
    try {
      const arr1 = sheetsData[sheetNames[0]];
      const arr2 = sheetsData[sheetNames[1]];
      const { a, b, n } = extractCoeffsFromSheetArr(arr1);
      const params = extractParamsFromSheetArr(arr2, n);
      if (params.length === 0) throw new Error('参数表无有效数据');

      const type = typeSelect.value;
      const method = methodSelect.value;
      let calcResults, varNames;

      if (type === '油') {
        const header = arr2[0]?.slice(0, n) || [];
        varNames = header.map((h, i) => h || `参数${i + 1}`);
        calcResults = method.includes('线性')
          ? calcOilLinear(a, b, params)
          : calcOilNonlinear(a, b, params);

        const y_true = calcResults.map(r => r.y.map(v => isNaN(v) ? 0 : v));
        const y_pred = calcResults.map(r => r.predicted.map(v => isNaN(v) ? 0 : v));
        const exportRows = buildResultTableForExport('油', varNames, calcResults);
        displayResultTable(exportRows);
        resultState = { tableArray: exportRows, y_true, y_pred, varNames };
        setStatus(`计算完成：油 · ${method} · ${calcResults.length} 条`);
      } else {
        if (n % 2 !== 0) throw new Error('气的系数列数必须为偶数');
        const { results, varNames: isotopeNames } = calcGasNonlinear(a, b, params);
        calcResults = results.map(r => ({ x: r.x, y: r.y, predicted: r.predicted }));
        varNames = isotopeNames;
        const y_true = calcResults.map(r => r.y.map(v => isNaN(v) ? 0 : v));
        const y_pred = calcResults.map(r => r.predicted.map(v => isNaN(v) ? 0 : v));
        const exportRows = buildResultTableForExport('气', varNames, calcResults);
        displayResultTable(exportRows);
        resultState = { tableArray: exportRows, y_true, y_pred, varNames };
        setStatus(`计算完成：气 · 非线性 · ${calcResults.length} 条`);
      }

      exportBtn.disabled = false;
      plotBtn.disabled = false;
    } catch (err) {
      console.error(err);
      setStatus('计算失败：' + err.message, true);
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = '开始计算';
    }
  }, 100);
});

exportBtn.addEventListener('click', () => {
  if (!resultState?.tableArray) {
    setStatus('无可导出的结果。', true);
    return;
  }
  exportToExcel(resultState.tableArray);
  setStatus('结果已导出（浏览器下载）');
});

plotBtn.addEventListener('click', () => {
  if (!resultState) {
    setStatus('请先计算。', true);
    return;
  }
  plotPredictionScatter(resultState.varNames, resultState.y_true, resultState.y_pred);
  setStatus('绘图完成');
});
