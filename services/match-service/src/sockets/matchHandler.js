module.exports = (io, socket) => {
  // A. Unirse a la sala de una partida
  socket.on('join_match', ({ matchId, userId }) => {
    socket.join(matchId);
    console.log(`👤 Usuario ${userId} se unió a la arena ${matchId}`);
    
    // Avisar al oponente que el jugador está listo
    socket.to(matchId).emit('opponent_joined', { message: 'El oponente ha entrado a la arena' });
  });

  // B. Fase de Escaneo NFC Anti-Trampas
  socket.on('scan_nfc_card', ({ matchId, userId, cardId }) => {
    console.log(`🃏 Usuario ${userId} escaneó la carta NFC: ${cardId}`);
    
    // Notificar a ambos jugadores que la carta se registró en el tablero
    io.to(matchId).emit('card_deployed', { userId, cardId });
  });

  // C. Sistema de Ataque
  socket.on('attack_action', ({ matchId, userId, cardAttacker, cardTarget, damage }) => {
    console.log(`⚔️ Ataque en sala ${matchId}: ${cardAttacker} hace ${damage} a ${cardTarget}`);
    
    // Sincronizar la animación y resta de vida en el celular de ambos jugadores
    io.to(matchId).emit('update_board_state', {
      actorId: userId,
      cardAttacker,
      cardTarget,
      damageDealt: damage
    });
  });

  // D. Desconexión
  socket.on('disconnect', () => {
    console.log(`🔴 Jugador desconectado de la arena: ${socket.id}`);
  });
};