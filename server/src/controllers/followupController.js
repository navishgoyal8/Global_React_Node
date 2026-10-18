const db = require('../config/db');

const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_followups (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id       INT          NULL,
      preference_id    INT          NULL,
      lead_phone       VARCHAR(50)  NULL,
      title            VARCHAR(255) NOT NULL,
      type             VARCHAR(50)  NULL,
      channel          VARCHAR(20)  NULL,
      notes            TEXT         NULL,
      popup_note       VARCHAR(60)  NULL,
      due_date         DATE         NOT NULL,
      due_time         TIME         NOT NULL,
      status           ENUM('pending','done') DEFAULT 'pending',
      reminder_1_hours INT          DEFAULT 6,
      reminder_2_hours INT          DEFAULT 1,
      reminder_1_sent  TINYINT      DEFAULT 0,
      reminder_2_sent  TINYINT      DEFAULT 0,
      created_by       INT          NULL,
      created_on       DATETIME     DEFAULT NOW(),
      modified_on      DATETIME     NULL,
      is_deleted       TINYINT      DEFAULT 0,
      INDEX idx_fu_invoice (invoice_id),
      INDEX idx_fu_phone   (lead_phone),
      INDEX idx_fu_due     (due_date, due_time, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_triggered_reminders (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      followup_id      INT          NOT NULL,
      which_reminder   TINYINT      NOT NULL,
      lead_phone       VARCHAR(50)  NULL,
      title            VARCHAR(255) NOT NULL,
      popup_note       VARCHAR(60)  NULL,
      notes            TEXT         NULL,
      due_date         DATE         NOT NULL,
      due_time         TIME         NOT NULL,
      triggered_at     DATETIME     DEFAULT NOW(),
      dismissed        TINYINT      DEFAULT 0,
      dismissed_at     DATETIME     NULL,
      INDEX idx_tr_followup (followup_id),
      INDEX idx_tr_dismissed (dismissed)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
};
ensureTable().catch(err => console.error('ensureTable error:', err.message));

exports.createFollowup = async (req, res) => {
  try {
    const {
      invoiceId, preferenceId, leadPhone, title, type, channel, notes, popupNote,
      dueDate, dueTime, reminder1Hours, reminder2Hours, createdBy
    } = req.body;

    if (!title || !dueDate || !dueTime) {
      return res.json({ success: false, message: 'Title, date, and time are required.' });
    }

    const [result] = await db.query(`
      INSERT INTO crm_followups
        (invoice_id, preference_id, lead_phone, title, type, channel,
         notes, popup_note, due_date, due_time, reminder_1_hours, reminder_2_hours, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceId || null, preferenceId || null, leadPhone || null,
      title, type || null, channel || null,
      notes || '', (popupNote || '').substring(0, 60),
      dueDate, dueTime,
      reminder1Hours ?? 6, reminder2Hours ?? 1,
      createdBy || null
    ]);

    const [rows] = await db.query('SELECT * FROM crm_followups WHERE id = ?', [result.insertId]);
    res.json({ success: true, followup: rows[0] });
  } catch (err) {
    console.error('createFollowup error:', err);
    res.status(500).json({ success: false, message: 'Failed to create follow-up.' });
  }
};

exports.listByInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM crm_followups WHERE invoice_id = ? AND is_deleted = 0 ORDER BY due_date ASC, due_time ASC',
      [invoiceId]
    );
    res.json({ success: true, followups: rows });
  } catch (err) {
    console.error('listByInvoice error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch follow-ups.' });
  }
};

exports.listByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM crm_followups WHERE lead_phone = ? AND is_deleted = 0 ORDER BY due_date ASC, due_time ASC',
      [phone]
    );
    res.json({ success: true, followups: rows });
  } catch (err) {
    console.error('listByPhone error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch follow-ups.' });
  }
};

exports.updateFollowup = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      invoiceId, preferenceId, leadPhone, title, type, channel, notes, popupNote,
      dueDate, dueTime, reminder1Hours, reminder2Hours
    } = req.body;

    const [result] = await db.query(`
      UPDATE crm_followups SET
        invoice_id      = ?,
        preference_id   = ?,
        lead_phone      = ?,
        title           = ?,
        type            = ?,
        channel         = ?,
        notes           = ?,
        popup_note      = ?,
        due_date        = ?,
        due_time        = ?,
        reminder_1_hours= ?,
        reminder_2_hours= ?,
        modified_on     = NOW()
      WHERE id = ? AND is_deleted = 0
    `, [
      invoiceId || null, preferenceId || null, leadPhone || null,
      title, type || null, channel || null,
      notes || '', (popupNote || '').substring(0, 60),
      dueDate, dueTime,
      reminder1Hours ?? 6, reminder2Hours ?? 1,
      id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Follow-up not found.' });
    }
    const [rows] = await db.query('SELECT * FROM crm_followups WHERE id = ?', [id]);
    res.json({ success: true, followup: rows[0] });
  } catch (err) {
    console.error('updateFollowup error:', err);
    res.status(500).json({ success: false, message: 'Failed to update follow-up.' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    if (!id || !['done', 'pending'].includes(status)) {
      return res.json({ success: false, message: 'Invalid id or status.' });
    }
    await db.query(
      'UPDATE crm_followups SET status = ?, modified_on = NOW() WHERE id = ? AND is_deleted = 0',
      [status, id]
    );
    const [rows] = await db.query('SELECT * FROM crm_followups WHERE id = ?', [id]);
    res.json({ success: true, followup: rows[0] });
  } catch (err) {
    console.error('updateStatus error:', err);
    res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
};

exports.deleteFollowup = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(
      'UPDATE crm_followups SET is_deleted = 1, modified_on = NOW() WHERE id = ?',
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('deleteFollowup error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete follow-up.' });
  }
};

exports.triggerReminders = async () => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const nowDT = `${today} ${currentTime}`;

    const [rows] = await db.query(`
      SELECT f.*,
        TIMESTAMPDIFF(MINUTE, CONCAT(f.due_date, ' ', f.due_time), ?) AS minutes_until_due
      FROM crm_followups f
      WHERE f.is_deleted = 0
        AND f.status = 'pending'
        AND CONCAT(f.due_date, ' ', f.due_time) >= ?
        AND (
          (f.reminder_1_sent = 0
           AND TIMESTAMPDIFF(MINUTE, CONCAT(f.due_date, ' ', f.due_time), ?)
               BETWEEN -(f.reminder_1_hours * 60) AND 0)
          OR
          (f.reminder_2_sent = 0
           AND TIMESTAMPDIFF(MINUTE, CONCAT(f.due_date, ' ', f.due_time), ?)
               BETWEEN -(f.reminder_2_hours * 60) AND 0)
        )
    `, [nowDT, nowDT, nowDT, nowDT]);

    const triggered = [];
    for (const row of rows) {
      const mu = row.minutes_until_due;
      let whichReminder = null;

      if (row.reminder_1_sent === 0 && mu >= -(row.reminder_1_hours || 6) * 60 && mu <= 0) {
        whichReminder = 1;
      } else if (row.reminder_2_sent === 0 && mu >= -(row.reminder_2_hours || 1) * 60 && mu <= 0) {
        whichReminder = 2;
      }

      if (whichReminder) {
        const col = whichReminder === 1 ? 'reminder_1_sent' : 'reminder_2_sent';
        await db.query(`UPDATE crm_followups SET ${col} = 1 WHERE id = ?`, [row.id]);

        const [existing] = await db.query(
          'SELECT id FROM crm_triggered_reminders WHERE followup_id = ? AND which_reminder = ? AND dismissed = 0',
          [row.id, whichReminder]
        );

        if (existing.length === 0) {
          await db.query(`
            INSERT INTO crm_triggered_reminders
              (followup_id, which_reminder, lead_phone, title, popup_note, notes, due_date, due_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            row.id, whichReminder, row.lead_phone, row.title,
            row.popup_note, row.notes, row.due_date, row.due_time
          ]);
          triggered.push({ ...row, whichReminder });
        }
      }
    }

    return triggered;
  } catch (err) {
    console.error('triggerReminders error:', err);
    return [];
  }
};

exports.checkDueReminders = async (req, res) => {
  try {
    const due = await exports.triggerReminders();
    res.json({ success: true, due });
  } catch (err) {
    console.error('checkDueReminders error:', err);
    res.status(500).json({ success: false, message: 'Failed to check reminders.' });
  }
};

exports.listTriggered = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM crm_triggered_reminders WHERE dismissed = 0 ORDER BY triggered_at DESC'
    );
    res.json({ success: true, triggered: rows });
  } catch (err) {
    console.error('listTriggered error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch triggered reminders.' });
  }
};

exports.dismissTriggered = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'all') {
      await db.query('UPDATE crm_triggered_reminders SET dismissed = 1, dismissed_at = NOW() WHERE dismissed = 0');
    } else {
      await db.query('UPDATE crm_triggered_reminders SET dismissed = 1, dismissed_at = NOW() WHERE id = ?', [id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('dismissTriggered error:', err);
    res.status(500).json({ success: false, message: 'Failed to dismiss.' });
  }
};
