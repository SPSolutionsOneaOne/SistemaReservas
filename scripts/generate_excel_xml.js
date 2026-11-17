const fs = require('fs');
const path = require('path');

// Read test cases from CSV or require them
const csvPath = path.join(__dirname, '..', 'docs', 'plan_de_pruebas_90_casos.csv');
const rawContent = fs.readFileSync(csvPath, 'utf8');

// We will parse the 90 cases from the CSV or import directly from build_test_plan_90
// Let's create an XML Spreadsheet (SpreadsheetML) compatible with Microsoft Excel
function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Let's load the testCases directly by evaluating the build file logic or parsing
const scriptContent = fs.readFileSync(path.join(__dirname, 'build_test_plan_90.js'), 'utf8');
const testCasesMatch = scriptContent.match(/const testCases = (\[[\s\S]*?\]);\s*console\.log/);
let testCases = eval(testCasesMatch[1]);

console.log('Loaded testCases:', testCases.length);

// Fallback: if rows are empty (alignment issue), parse the merged CSV produced by build_test_plan_90.js
const csvTestCaseParser = (file) => {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  // CSV parser: honors double-quoted fields with embedded commas/newlines/quotes.
  const rows = [];
  let cur = [], curField = '', inQuotes = false, field = '';
  const pushField = () => { cur.push(field); field = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') pushField();
      else if (ch === '\n' || ch === '\r') {
        if (field !== '' || cur.length) { pushField(); rows.push(cur); cur = []; }
        if (ch === '\n') {} else if (text[i + 1] === '\n') i++;
      } else field += ch;
    }
  }
  if (field !== '' || cur.length) { pushField(); rows.push(cur); }
  return rows.filter((r) => r[0] && String(r[0]).startsWith('CP-'));
};

let rowsFromCsv = [];
try {
  rowsFromCsv = csvTestCaseParser(csvPath).map((r) => ({
    id: r[0] || '', fase: r[1] || '', ref: r[2] || '', categoria: r[3] || '',
    nombre: r[4] || '', pre: r[5] || '', pasos: r[6] || '', cmd: r[7] || '',
    criterio: r[8] || '', estado: r[9] || '', prioridad: r[10] || '',
    evidencia: r[11] || '', resultado: r[12] || '',
  }));
} catch (e) {
  console.warn('No se pudo leer CSV para fallback:', e.message);
}
if (rowsFromCsv.length > 0) {
  testCases = rowsFromCsv;
  console.log('Usados resultados desde CSV:', testCases.length);
}

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#1E3A8A"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="SubTitleStyle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#475569"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E40AF" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
   </Borders>
  </Style>
  <Style ss:ID="CellStyle">
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="IdStyle">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#1E293B"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Top"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="MustPriority">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#991B1B"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Top"/>
   <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="ShouldPriority">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#854D0E"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Top"/>
   <Interior ss:Color="#FEF9C3" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="ResultadoStyle">
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
   <Font ss:FontName="Consolas" ss:Size="9" ss:Color="#334155"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CouldPriority">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#166534"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Top"/>
   <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Plan de Pruebas 90 Casos">
  <Table ss:DefaultRowHeight="20">
   <Column ss:Width="80"/>
   <Column ss:Width="70"/>
   <Column ss:Width="130"/>
   <Column ss:Width="95"/>
   <Column ss:Width="240"/>
   <Column ss:Width="180"/>
   <Column ss:Width="250"/>
   <Column ss:Width="230"/>
   <Column ss:Width="280"/>
   <Column ss:Width="90"/>
   <Column ss:Width="75"/>
   <Column ss:Width="120"/>
    <Column ss:Width="300"/>

   <Row ss:Height="24">
    <Cell ss:MergeAcross="12" ss:StyleID="TitleStyle"><Data ss:Type="String">PLAN DE PRUEBAS DE SOFTWARE - MARCO ISO/IEC/IEEE 29119-3 &amp; ISO 25010</Data></Cell>
   </Row>
   <Row ss:Height="20">
    <Cell ss:MergeAcross="12" ss:StyleID="SubTitleStyle"><Data ss:Type="String">Estrategia de Ejecución Incremental por Fases con Pruebas de Regresión Acumulativa (90 Casos Atómicos)</Data></Cell>
   </Row>
   <Row ss:Height="16"><Cell ss:MergeAcross="12"/></Row>
   <Row ss:Height="25">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">ID Caso</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Fase Origen</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Ref. RF/RNF/ISO</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Categoría</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nombre del Caso / Objetivo</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Precondiciones</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Pasos de Ejecución</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Comando / Script / Tool</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Criterio de Aceptación (Resultado Esperado)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Estado Ejecución</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Prioridad</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Ref. Evidencia (Print/Log)</Data></Cell>
     <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Resultado Obtenido</Data></Cell>
   </Row>
`;

testCases.forEach(tc => {
  let prioStyle = 'CellStyle';
  if (tc.prioridad === 'Must') prioStyle = 'MustPriority';
  else if (tc.prioridad === 'Should') prioStyle = 'ShouldPriority';
  else if (tc.prioridad === 'Could') prioStyle = 'CouldPriority';

  xml += `   <Row ss:AutoFitHeight="1">
    <Cell ss:StyleID="IdStyle"><Data ss:Type="String">${escapeXml(tc.id)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.fase)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.ref)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.categoria)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.nombre)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.pre)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.pasos)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.cmd)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.criterio)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.estado)}</Data></Cell>
    <Cell ss:StyleID="${prioStyle}"><Data ss:Type="String">${escapeXml(tc.prioridad)}</Data></Cell>
    <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(tc.evidencia)}</Data></Cell>
    <Cell ss:StyleID="ResultadoStyle"><Data ss:Type="String">${escapeXml(tc.resultado || '')}</Data></Cell>
   </Row>
`;
});

xml += `  </Table>
 </Worksheet>
</Workbook>`;

const xlsPathDocs = path.join(__dirname, '..', 'docs', 'plan_de_pruebas_90_casos.xls');
fs.writeFileSync(xlsPathDocs, xml, 'utf8');
console.log('Saved XLS to:', xlsPathDocs);

const artifactDir = 'C:\\Users\\allen\\.gemini\\antigravity\\brain\\446916fd-5507-4b42-90bb-1f558886f7be';
if (fs.existsSync(artifactDir)) {
  const artifactPathXls = path.join(artifactDir, 'plan_de_pruebas_90_casos.xls');
  fs.writeFileSync(artifactPathXls, xml, 'utf8');
  console.log('Saved XLS to artifact dir:', artifactPathXls);
}
