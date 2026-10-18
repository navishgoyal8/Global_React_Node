const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const fetchCheckAvailabilityLeads = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/leads/check-availability`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching check availability leads:", error);
    return [];
  }
};

export const fetchInboxData = async () => {
  try {

    const response = await fetch(`${API_BASE_URL}/twilio-inbox`);
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    return data; 
    
  } catch (error) {
    console.error("Error fetching inbox from API:", error);
    return []; 
  }
};