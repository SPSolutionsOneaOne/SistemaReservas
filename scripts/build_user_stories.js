const fs = require('fs');
const path = require('path');

const userStories = [
  // --- Historias originales de la imagen (HU-01 a HU-06) ---
  {
    id: 'HU-01',
    historia: 'Como usuario, quiero consultar las salas disponibles por fecha y bloque, para saber qué recintos están libres.',
    prioridad: 'Must',
    puntos: 5,
    dep: 'Ninguna',
    origen: 'Original'
  },
  {
    id: 'HU-02',
    historia: 'Como alumno/docente, quiero reservar una sala disponible, para asegurar un espacio sin conflictos de horario.',
    prioridad: 'Must',
    puntos: 8,
    dep: 'HU-01',
    origen: 'Original'
  },
  {
    id: 'HU-03',
    historia: 'Como usuario, quiero confirmar mi asistencia (Check-in QR/Manual), para validar el uso de la sala y no ser sancionado.',
    prioridad: 'Must',
    puntos: 5,
    dep: 'HU-02',
    origen: 'Original'
  },
  {
    id: 'HU-04',
    historia: 'Como encargado, quiero gestionar reservas presenciales de terceros, para asistir a usuarios sin acceso temporal.',
    prioridad: 'Must',
    puntos: 5,
    dep: 'HU-02',
    origen: 'Original'
  },
  {
    id: 'HU-05',
    historia: 'Como motor del sistema, quiero bloquear por 7 días a usuarios con 3 inasistencias, para desincentivar el acaparamiento.',
    prioridad: 'Must',
    puntos: 8,
    dep: 'HU-03',
    origen: 'Original'
  },
  {
    id: 'HU-06',
    historia: 'Como alumno/docente, quiero cancelar mi propia reserva, para liberar el horario si no podré asistir.',
    prioridad: 'Must',
    puntos: 3,
    dep: 'HU-02',
    origen: 'Original'
  },

  // --- Historias pertinentes extraídas de lo que ya hace el sistema (HU-07 a HU-18) ---
  {
    id: 'HU-07',
    historia: 'Como usuario institucional (alumno, docente o encargado), quiero iniciar sesión con mi RUT y contraseña encriptada (Argon2id), para acceder a las funcionalidades del sistema según mi rol de forma segura.',
    prioridad: 'Must',
    puntos: 5,
    dep: 'Ninguna',
    origen: 'Sistema - Auth & RBAC'
  },
  {
    id: 'HU-08',
    historia: 'Como usuario autenticado, quiero cerrar mi sesión explícitamente, para invalidar la cookie de sesión y proteger la privacidad de mi cuenta en terminales compartidos.',
    prioridad: 'Must',
    puntos: 2,
    dep: 'HU-07',
    origen: 'Sistema - Auth'
  },
  {
    id: 'HU-09',
    historia: 'Como docente, quiero editar el bloque horario de una reserva propia activa sin cancelarla, para reprogramar mis actividades académicas optimizando mi tiempo.',
    prioridad: 'Must',
    puntos: 5,
    dep: 'HU-02',
    origen: 'Sistema - Reservas'
  },
  {
    id: 'HU-10',
    historia: 'Como alumno/docente, quiero registrar asistentes institucionales (@institucion.cl) respetando el aforo de la sala, para validar que los participantes pertenezcan a la institución y no sobrepasar la capacidad permitida.',
    prioridad: 'Must',
    puntos: 5,
    dep: 'HU-02',
    origen: 'Sistema - Validación Asistentes'
  },
  {
    id: 'HU-11',
    historia: 'Como usuario con reserva confirmada, quiero recibir una notificación automática con archivo .ics adjunto vía correo electrónico, para sincronizar la reserva en mi calendario personal (Google/Outlook).',
    prioridad: 'Should',
    puntos: 5,
    dep: 'HU-02',
    origen: 'Sistema - Observer ICS'
  },
  {
    id: 'HU-12',
    historia: 'Como administrador, quiero crear y clasificar salas con autogeneración de siglas correlativas (LAB-01, AUD-01), para catalogar los recintos del campus de forma estandarizada y evitar duplicados.',
    prioridad: 'Must',
    puntos: 5,
    dep: 'HU-07',
    origen: 'Sistema - SalaFactory'
  },
  {
    id: 'HU-13',
    historia: 'Como encargado de laboratorio, quiero anular reservas de alumnos por motivos administrativos y dejar registro justificado en bitácora, para resolver contingencias operativas con total trazabilidad.',
    prioridad: 'Must',
    puntos: 5,
    dep: 'HU-02, HU-04',
    origen: 'Sistema - Bitácora Admin'
  },
  {
    id: 'HU-14',
    historia: 'Como motor del sistema, quiero desbloquear automáticamente a usuarios penalizados cumplidos los 7 días de sanción, para restituir su capacidad de reserva sin requerir intervención administrativa.',
    prioridad: 'Must',
    puntos: 3,
    dep: 'HU-05',
    origen: 'Sistema - Cronjob Ausencias'
  },
  {
    id: 'HU-15',
    historia: 'Como administrador institucional, quiero visualizar un panel de métricas de ocupación diaria, desglose por tipo de recinto y ranking de uso, para tomar decisiones informadas sobre la asignación de espacios.',
    prioridad: 'Could',
    puntos: 5,
    dep: 'HU-01, HU-02',
    origen: 'Sistema - Métricas Dashboard'
  },
  {
    id: 'HU-16',
    historia: 'Como oficial de cumplimiento de datos, quiero ejecutar un proceso automatizado de disociación y anonimización de reservas con más de 1 año de antigüedad, para cumplir estrictamente con la Ley 21.719 de Protección de Datos.',
    prioridad: 'Must',
    puntos: 5,
    dep: 'HU-02',
    origen: 'Sistema - Cronjob Limpieza'
  },
  {
    id: 'HU-17',
    historia: 'Como usuario móvil, quiero instalar la aplicación como PWA y recibir alertas visuales ante pérdida de conexión, para utilizar el servicio en smartphones sin depender de tiendas de aplicaciones.',
    prioridad: 'Should',
    puntos: 3,
    dep: 'HU-01',
    origen: 'Sistema - PWA ServiceWorker'
  },
  {
    id: 'HU-18',
    historia: 'Como usuario con preferencias visuales o necesidades de accesibilidad, quiero alternar entre tema claro/oscuro y navegar completamente mediante teclado (Tab/Enter), para operar el sistema conforme a pautas WCAG 2.1.',
    prioridad: 'Should',
    puntos: 3,
    dep: 'Ninguna',
    origen: 'Sistema - Accesibilidad UX'
  }
];

// 1. Generate CSV file
function escapeCsv(field) {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('\"') || str.includes('\n') || str.includes('\r')) {
    return '\"' + str.replace(/\"/g, '\"\"') + '\"';
  }
  return str;
}

const csvHeader = ['ID', 'Historia de Usuario', 'Prioridad', 'Est. (Puntos)', 'Dep.', 'Módulo / Origen'];
const csvLines = [];
csvLines.push(csvHeader.join(','));

userStories.forEach(u => {
  csvLines.push([
    escapeCsv(u.id),
    escapeCsv(u.historia),
    escapeCsv(u.prioridad),
    escapeCsv(u.puntos),
    escapeCsv(u.dep),
    escapeCsv(u.origen)
  ].join(','));
});

const csvOutput = '\ufeff' + csvLines.join('\r\n');
const docsCsvPath = path.join(__dirname, '..', 'docs', 'historias_de_usuario.csv');
fs.writeFileSync(docsCsvPath, csvOutput, 'utf8');
console.log('Saved CSV to:', docsCsvPath);

// 2. Generate XML Spreadsheet (SpreadsheetML) with exact styles matching the user image
function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  <Style ss:ID="HeaderStyle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#4F81BD" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#385D8A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8CCE4"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8CCE4"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#385D8A"/>
   </Borders>
  </Style>
  <Style ss:ID="HeaderCenterStyle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#4F81BD" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#385D8A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8CCE4"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8CCE4"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#385D8A"/>
   </Borders>
  </Style>
  <Style ss:ID="IdStyle">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
  <Style ss:ID="StoryStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
  <Style ss:ID="CenterStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
  <Style ss:ID="PointsStyle">
   <Font ss:FontName="Calibri" ss:Bold="1" ss:Color="#1F497D"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Historias de Usuario">
  <Table ss:DefaultRowHeight="24">
   <Column ss:Width="70"/>
   <Column ss:Width="420"/>
   <Column ss:Width="80"/>
   <Column ss:Width="85"/>
   <Column ss:Width="100"/>
   <Column ss:Width="140"/>

   <Row ss:Height="26">
    <Cell ss:StyleID="HeaderCenterStyle"><Data ss:Type="String">ID</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Historia de Usuario</Data></Cell>
    <Cell ss:StyleID="HeaderCenterStyle"><Data ss:Type="String">Prioridad</Data></Cell>
    <Cell ss:StyleID="HeaderCenterStyle"><Data ss:Type="String">Est. (Puntos)</Data></Cell>
    <Cell ss:StyleID="HeaderCenterStyle"><Data ss:Type="String">Dep.</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Módulo / Origen</Data></Cell>
   </Row>
`;

userStories.forEach(u => {
  xml += `   <Row ss:AutoFitHeight="1">
    <Cell ss:StyleID="IdStyle"><Data ss:Type="String">${escapeXml(u.id)}</Data></Cell>
    <Cell ss:StyleID="StoryStyle"><Data ss:Type="String">${escapeXml(u.historia)}</Data></Cell>
    <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(u.prioridad)}</Data></Cell>
    <Cell ss:StyleID="PointsStyle"><Data ss:Type="Number">${u.puntos}</Data></Cell>
    <Cell ss:StyleID="CenterStyle"><Data ss:Type="String">${escapeXml(u.dep)}</Data></Cell>
    <Cell ss:StyleID="StoryStyle"><Data ss:Type="String">${escapeXml(u.origen)}</Data></Cell>
   </Row>
`;
});

xml += `  </Table>
 </Worksheet>
</Workbook>`;

const docsXlsPath = path.join(__dirname, '..', 'docs', 'historias_de_usuario.xls');
fs.writeFileSync(docsXlsPath, xml, 'utf8');
console.log('Saved XLS to:', docsXlsPath);

const artifactDir = 'C:\\Users\\allen\\.gemini\\antigravity\\brain\\446916fd-5507-4b42-90bb-1f558886f7be';
if (fs.existsSync(artifactDir)) {
  const artifactPathXls = path.join(artifactDir, 'historias_de_usuario.xls');
  fs.writeFileSync(artifactPathXls, xml, 'utf8');
  const artifactPathCsv = path.join(artifactDir, 'historias_de_usuario.csv');
  fs.writeFileSync(artifactPathCsv, csvOutput, 'utf8');
  console.log('Saved to artifact directory');
}
