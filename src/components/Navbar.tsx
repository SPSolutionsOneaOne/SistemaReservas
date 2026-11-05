'use client';

import React from 'react';

interface NavbarProps {
  tabActiva: string;
  setTabActiva: (tab: string) => void;
  rutSesion: string;
  setRutSesion: (rut: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  tabActiva,
  setTabActiva,
  rutSesion,
  setRutSesion,
}) => {
  return (
    <header className="bg-institucional-primary text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setTabActiva('reserva')}>
            <div className="bg-red-600 text-white font-extrabold px-3 py-1 rounded text-lg tracking-wider">
              INACAP
            </div>
            <div>
              <span className="font-bold text-lg block leading-tight">Sistema de Reservas</span>
              <span className="text-xs text-gray-300 block">Gestión Integrada de Infraestructura</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <label htmlFor="rut_header" className="text-xs text-gray-300 font-medium hidden sm:inline">
              RUT Titular:
            </label>
            <input
              id="rut_header"
              type="text"
              value={rutSesion}
              onChange={(e) => setRutSesion(e.target.value)}
              placeholder="Ej: 12.345.678-5"
              className="text-xs px-2.5 py-1.5 rounded bg-slate-800 text-white border border-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 w-36"
            />
          </div>
        </div>

        {/* Barra de navegación de pestañas */}
        <nav className="flex space-x-1 border-t border-slate-700/60 pt-1 pb-2 overflow-x-auto">
          <button
            onClick={() => setTabActiva('reserva')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              tabActiva === 'reserva'
                ? 'bg-red-600 text-white'
                : 'text-gray-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            📅 Nueva Reserva
          </button>
          <button
            onClick={() => setTabActiva('salas')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              tabActiva === 'salas'
                ? 'bg-red-600 text-white'
                : 'text-gray-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            🏢 Catálogo de Salas
          </button>
          <button
            onClick={() => setTabActiva('mis-reservas')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              tabActiva === 'mis-reservas'
                ? 'bg-red-600 text-white'
                : 'text-gray-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            📋 Mis Reservas & Check-in
          </button>
          <button
            onClick={() => setTabActiva('bitacora')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              tabActiva === 'bitacora'
                ? 'bg-red-600 text-white'
                : 'text-gray-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            🛡️ Auditoría Presencial (RF-SEC-04)
          </button>
        </nav>
      </div>
    </header>
  );
};
